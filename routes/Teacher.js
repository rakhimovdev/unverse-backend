const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const User = require("../models/User");
const TimeSlot = require("../models/TimeSlot");
const Homework = require("../models/Homework");
const ReadingTest = require("../models/Test");
const ListeningTest = require("../models/Testl");
const WritingTask = require("../models/writing");
const Result = require("../models/Result");
const WritingResult = require("../models/WritingResult");
const { normalizeHomeworkSections } = require("../utils/homeworkSections");
const { buildAssignmentResults } = require("../utils/homeworkResults");

const requireTeacher = (req, res, next) => {
  if (!req.user || req.user.role !== "teacher") {
    return res.status(403).json({ message: "Faqat teacher ruxsatga ega." });
  }
  return next();
};

const buildGroupName = (slot) => `${slot.day || "Guruh"} - ${slot.time || "vaqt"}`;

const getGroupMembers = async (teacherId, slotId) => {
  const students = await User.find({
    role: "student",
    teacher: teacherId,
    $or: [{ timeSlot: slotId }, { timeSlots: slotId }]
  }).select("_id fullname name lastname username email studentType timeSlot timeSlots");

  return students.map((student) => ({
    id: String(student._id),
    fullname: student.fullname || [student.name, student.lastname].filter(Boolean).join(" "),
    name: student.name || "",
    lastname: student.lastname || "",
    username: student.username || "",
    email: student.email || "",
    studentType: student.studentType || null
  }));
};

const getGroupPayload = async (teacherId, slot) => {
  const students = await getGroupMembers(teacherId, slot._id);

  return {
    id: String(slot._id),
    name: buildGroupName(slot),
    day: slot.day,
    time: slot.time,
    studentCount: students.length,
    students,
    lessonSchedule: `${slot.day || "-"} ${slot.time || "-"}`
  };
};

const getGroupWithHomework = async (teacherId, slot) => {
  const group = await getGroupPayload(teacherId, slot);
  const assignments = await Homework.find({
    teacher: teacherId,
    group: slot._id,
    isDeleted: false
  }).sort({ lessonDate: 1, createdAt: -1 }).lean();
  const assignmentIds = assignments.map((assignment) => assignment._id);
  const studentIds = group.students.map((student) => student.id);

  const [results, writingResults] = assignmentIds.length && studentIds.length
    ? await Promise.all([
        Result.find({
          homeworkId: { $in: assignmentIds },
          userId: { $in: studentIds },
          moduleType: { $in: ["Reading", "Listening", "Writing"] }
        }).sort({ createdAt: -1 }).lean(),
        WritingResult.find({
          homeworkId: { $in: assignmentIds },
          userId: { $in: studentIds },
          taskType: { $in: ["task1", "task2"] }
        }).sort({ createdAt: -1 }).lean()
      ])
    : [[], []];

  return {
    ...group,
    homeworkCount: assignments.length,
    homework: buildAssignmentResults({
      students: group.students,
      assignments,
      results,
      writingResults
    })
  };
};

const ensureSectionExists = async (sectionType, testId) => {
  if (!testId) return null;

  if (sectionType === "reading") {
    const test = await ReadingTest.findById(testId).select("_id name");
    return test ? { id: String(test._id), label: test.name || "Reading test" } : null;
  }

  if (sectionType === "listening") {
    const test = await ListeningTest.findById(testId).select("_id title");
    return test ? { id: String(test._id), label: test.title || "Listening test" } : null;
  }

  if (sectionType === "writing") {
    const test = await WritingTask.findById(testId).select("_id task1Topic task2Topic topic");
    if (!test) return null;
    const label = test.task1Topic || test.task2Topic || test.topic || "Writing task";
    return { id: String(test._id), label };
  }

  return null;
};

const validateHomeworkSections = async (sectionData) => {
  const sections = {
    readingTestId: sectionData.readingTestId || "",
    listeningTestId: sectionData.listeningTestId || "",
    writingTestId: sectionData.writingTestId || "",
  };
  const entries = [
    ["reading", sections.readingTestId],
    ["listening", sections.listeningTestId],
    ["writing", sections.writingTestId],
  ];

  for (const [sectionType, testId] of entries) {
    if (!testId) continue;
    const exists = await ensureSectionExists(sectionType, testId);
    if (!exists) {
      throw new Error(`Bunday ${sectionType} test yoki vazifa topilmadi.`);
    }
  }

  if (!entries.some(([, testId]) => Boolean(testId))) {
    throw new Error("Kamida bitta section tanlang.");
  }

  return sections;
};

const normalizeHomeworkPayload = (body = {}) => {
  const sections = normalizeHomeworkSections(body);
  return {
    ...sections,
    extraInfo: typeof body.extraInfo === "string" ? body.extraInfo : (typeof body.extraInformation === "string" ? body.extraInformation : ""),
    instructions: typeof body.instructions === "string" ? body.instructions : "",
  };
};

router.get("/groups", auth, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.userDoc?._id || req.user.id;
    const slots = await TimeSlot.find({ teacher: teacherId }).sort({ day: 1, time: 1 });

    const payload = await Promise.all(slots.map((slot) => getGroupWithHomework(teacherId, slot)));
    res.json(payload);
  } catch (error) {
    console.error("Teacher groups error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
});

router.get("/groups/:groupId", auth, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.userDoc?._id || req.user.id;
    const slot = await TimeSlot.findOne({ _id: req.params.groupId, teacher: teacherId });

    if (!slot) {
      return res.status(404).json({ message: "Guruh topilmadi." });
    }

    const group = await getGroupWithHomework(teacherId, slot);
    res.json({ ...group, assignments: group.homework });
  } catch (error) {
    console.error("Teacher group details error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
});

router.get("/homework", auth, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.userDoc?._id || req.user.id;
    const { groupId } = req.query;

    const filter = { teacher: teacherId, isDeleted: false };
    if (groupId) filter.group = groupId;

    const items = await Homework.find(filter).sort({ lessonDate: 1, createdAt: -1 }).lean();

    res.json(items.map((item) => ({
      id: String(item._id),
      title: item.title,
      instructions: item.instructions || "",
      extraInfo: item.extraInfo || "",
      groupId: String(item.group),
      groupName: item.groupName || "",
      lessonDay: item.lessonDay || "",
      lessonDate: item.lessonDate || "",
      lessonTime: item.lessonTime || "",
      dueDate: item.dueDate || "",
      dueTime: item.dueTime || "",
      readingTestId: item.readingTestId || "",
      listeningTestId: item.listeningTestId || "",
      writingTestId: item.writingTestId || "",
      createdAt: item.createdAt,
      assignedAt: item.assignedAt,
      testType: item.testType || "",
      testId: item.testId || ""
    })));
  } catch (error) {
    console.error("Teacher homework list error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
});

router.post("/homework", auth, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.userDoc?._id || req.user.id;
    const body = req.body || {};
    const normalized = normalizeHomeworkPayload(body);
    const {
      title,
      instructions,
      extraInfo,
      groupId,
      groupName,
      lessonDate,
      lessonTime,
      lessonDay,
      dueDate,
      dueTime,
      readingTestId,
      listeningTestId,
      writingTestId,
      testType,
      testId
    } = { ...body, ...normalized, ...normalizeHomeworkSections(body) };

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "Homework title kerak." });
    }
    if (!groupId) {
      return res.status(400).json({ message: "Guruh tanlang." });
    }
    if (!lessonDate) {
      return res.status(400).json({ message: "Dars sanasi kerak." });
    }

    const slot = await TimeSlot.findOne({ _id: groupId, teacher: teacherId });
    if (!slot) {
      return res.status(403).json({ message: "Bu guruh sizga tegishli emas." });
    }

    let selectedSections = {
      readingTestId: readingTestId || normalized.readingTestId || "",
      listeningTestId: listeningTestId || normalized.listeningTestId || "",
      writingTestId: writingTestId || normalized.writingTestId || "",
    };

    try {
      selectedSections = await validateHomeworkSections(selectedSections);
    } catch (validationError) {
      return res.status(400).json({ message: validationError.message });
    }

    const payload = {
      teacher: teacherId,
      group: slot._id,
      groupName: groupName || buildGroupName(slot),
      title: String(title).trim(),
      instructions: String(instructions || "").trim(),
      extraInfo: String(extraInfo || "").trim(),
      lessonDay: lessonDay || slot.day || "",
      lessonTime: lessonTime || slot.time || "",
      lessonDate: String(lessonDate),
      dueDate: dueDate ? String(dueDate) : "",
      dueTime: dueTime ? String(dueTime) : "",
      testType: testType ? String(testType) : "",
      testId: testId ? String(testId) : "",
      readingTestId: selectedSections.readingTestId,
      listeningTestId: selectedSections.listeningTestId,
      writingTestId: selectedSections.writingTestId,
      sections: {
        reading: selectedSections.readingTestId ? { testId: selectedSections.readingTestId } : null,
        listening: selectedSections.listeningTestId ? { testId: selectedSections.listeningTestId } : null,
        writing: selectedSections.writingTestId ? { testId: selectedSections.writingTestId } : null,
      }
    };

    const existing = await Homework.findOne({
      teacher: teacherId,
      group: slot._id,
      lessonDate: payload.lessonDate,
      lessonTime: payload.lessonTime,
      isDeleted: false
    });

    if (existing) {
      return res.status(409).json({ message: "Ushbu dars uchun homework allaqachon qo'shilgan." });
    }

    const homework = await Homework.create(payload);

    res.status(201).json({
      message: "Homework muvaffaqiyatli saqlandi.",
      homework: {
        id: String(homework._id),
        ...payload,
        createdAt: homework.createdAt,
        assignedAt: homework.assignedAt
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Ushbu dars uchun homework allaqachon mavjud." });
    }
    console.error("Create homework error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
});

router.put("/homework/:id", auth, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.userDoc?._id || req.user.id;
    const homework = await Homework.findOne({ _id: req.params.id, teacher: teacherId, isDeleted: false });

    if (!homework) {
      return res.status(404).json({ message: "Homework topilmadi." });
    }

    const body = req.body || {};
    const normalized = normalizeHomeworkPayload(body);
    const { title, instructions, extraInfo, lessonDate, lessonTime, dueDate, dueTime, testType, testId, readingTestId, listeningTestId, writingTestId } = { ...body, ...normalized, ...normalizeHomeworkSections(body) };

    if (title !== undefined && !String(title).trim()) {
      return res.status(400).json({ message: "Homework title kerak." });
    }

    const sectionFields = [
      "readingTestId", "readingId", "reading", "readingAssignmentId", "readingTaskId",
      "listeningTestId", "listeningId", "listening", "listeningAssignmentId", "listeningTaskId",
      "writingTestId", "writingId", "writing", "writingAssignmentId", "writingTaskId",
    ];
    const hasSectionUpdates = sectionFields.some((field) => Object.prototype.hasOwnProperty.call(body, field)) ||
      Boolean(body.sections || body.sectionAssignments);
    let selectedSections = hasSectionUpdates
      ? normalized
      : {
          readingTestId: homework.readingTestId || "",
          listeningTestId: homework.listeningTestId || "",
          writingTestId: homework.writingTestId || "",
        };

    try {
      selectedSections = await validateHomeworkSections(selectedSections);
    } catch (validationError) {
      return res.status(400).json({ message: validationError.message });
    }

    const nextLessonDate = lessonDate !== undefined ? String(lessonDate) : homework.lessonDate;
    const nextLessonTime = lessonTime !== undefined ? String(lessonTime) : homework.lessonTime;
    if (
      nextLessonDate !== homework.lessonDate ||
      nextLessonTime !== homework.lessonTime
    ) {
      const duplicate = await Homework.findOne({
        _id: { $ne: homework._id },
        teacher: teacherId,
        group: homework.group,
        lessonDate: nextLessonDate,
        lessonTime: nextLessonTime,
        isDeleted: false,
      });
      if (duplicate) {
        return res.status(409).json({ message: "Ushbu dars uchun homework allaqachon qo'shilgan." });
      }
    }

    if (title !== undefined) homework.title = String(title).trim();
    if (instructions !== undefined) homework.instructions = String(instructions || "").trim();
    if (extraInfo !== undefined) homework.extraInfo = String(extraInfo || "").trim();
    if (lessonDate !== undefined) homework.lessonDate = String(lessonDate);
    if (lessonTime !== undefined) homework.lessonTime = String(lessonTime);
    if (dueDate !== undefined) homework.dueDate = String(dueDate || "");
    if (dueTime !== undefined) homework.dueTime = String(dueTime || "");
    if (testType !== undefined) homework.testType = String(testType || "");
    if (testId !== undefined) homework.testId = String(testId || "");
    homework.readingTestId = selectedSections.readingTestId;
    homework.listeningTestId = selectedSections.listeningTestId;
    homework.writingTestId = selectedSections.writingTestId;
    homework.sections = {
      reading: selectedSections.readingTestId ? { testId: selectedSections.readingTestId } : null,
      listening: selectedSections.listeningTestId ? { testId: selectedSections.listeningTestId } : null,
      writing: selectedSections.writingTestId ? { testId: selectedSections.writingTestId } : null,
    };

    await homework.save();

    res.json({ message: "Homework yangilandi.", homework });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Ushbu dars uchun homework allaqachon mavjud." });
    }
    console.error("Update homework error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
});

router.delete("/homework/:id", auth, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.userDoc?._id || req.user.id;
    const homework = await Homework.findOne({ _id: req.params.id, teacher: teacherId, isDeleted: false });

    if (!homework) {
      return res.status(404).json({ message: "Homework topilmadi." });
    }

    homework.isDeleted = true;
    await homework.save();

    res.json({ message: "Homework o'chirildi." });
  } catch (error) {
    console.error("Delete homework error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
});

router.get("/students/homework", auth, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "student") {
      return res.status(403).json({ message: "Student ruxsatga ega." });
    }

    const student = await User.findById(req.user.id).select("teacher timeSlot timeSlots");
    if (!student) {
      return res.status(404).json({ message: "Student topilmadi." });
    }

    const allowedGroupIds = new Set(
      [student.timeSlot, ...(student.timeSlots || [])].filter(Boolean).map((value) => String(value))
    );

    const items = await Homework.find({
      isDeleted: false,
      teacher: student.teacher,
      group: { $in: [...allowedGroupIds].map((id) => id) }
    }).sort({ lessonDate: -1, createdAt: -1 }).lean();

    const payload = items.map((item) => ({
      id: String(item._id),
      title: item.title,
      instructions: item.instructions || "",
      extraInfo: item.extraInfo || "",
      groupName: item.groupName || "",
      lessonDay: item.lessonDay || "",
      lessonDate: item.lessonDate || "",
      lessonTime: item.lessonTime || "",
      dueDate: item.dueDate || "",
      dueTime: item.dueTime || "",
      readingTestId: item.readingTestId || "",
      listeningTestId: item.listeningTestId || "",
      writingTestId: item.writingTestId || "",
      sections: {
        reading: item.readingTestId ? { testId: item.readingTestId } : null,
        listening: item.listeningTestId ? { testId: item.listeningTestId } : null,
        writing: item.writingTestId ? { testId: item.writingTestId } : null,
      },
      testType: item.testType || "",
      createdAt: item.createdAt,
      assignedAt: item.assignedAt
    }));

    res.json(payload);
  } catch (error) {
    console.error("Student homework list error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
});

module.exports = router;
