const mongoose = require("mongoose");

const sectionTestField = {
  Reading: "readingTestId",
  Listening: "listeningTestId",
  Writing: "writingTestId",
};

const findStudentHomeworkAssignment = async ({
  User,
  Homework,
  studentId,
  homeworkId,
  testId,
  moduleType,
}) => {
  if (!homeworkId) return null;
  if (!mongoose.Types.ObjectId.isValid(homeworkId)) return null;

  const student = await User.findById(studentId).select("role teacher timeSlot timeSlots");
  if (!student || !["student", "mooc"].includes(student.role)) return null;

  const allowedGroups = [student.timeSlot, ...(student.timeSlots || [])].filter(Boolean);
  if (!allowedGroups.length) return null;

  const assignment = await Homework.findOne({
    _id: homeworkId,
    teacher: student.teacher,
    group: { $in: allowedGroups },
    isDeleted: false,
  });
  if (!assignment) return null;

  const testField = sectionTestField[moduleType];
  if (!testField || String(assignment[testField] || "") !== String(testId || "")) {
    return null;
  }

  return assignment;
};

module.exports = { findStudentHomeworkAssignment };
