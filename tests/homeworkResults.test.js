const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAssignmentResults } = require("../utils/homeworkResults");
const { findStudentHomeworkAssignment } = require("../utils/homeworkAttempt");

const student = { id: "student-1", fullname: "Student One" };
const assignment = (id, lessonDay, testId = "shared-reading-test") => ({
  _id: id,
  lessonDay,
  lessonDate: `2026-10-${id.endsWith("tue") ? "13" : id.endsWith("thu") ? "15" : "17"}`,
  title: `${lessonDay} homework`,
  readingTestId: testId,
  listeningTestId: "",
  writingTestId: "",
});
const result = ({ id, homeworkId, testId = "shared-reading-test", moduleType = "Reading", userId = student.id, score = 7 }) => ({
  _id: id,
  homeworkId,
  testId,
  moduleType,
  userId,
  attemptKey: id,
  createdAt: new Date(`2026-10-${id.endsWith("1") ? "13" : "15"}T10:00:00Z`),
  completedAt: new Date("2026-10-16T10:00:00Z"),
  timeSpent: 90,
  overallBand: score,
  reading: { academicBand: score },
  listening: {},
  writing: {},
});

test("each weekday assignment receives only its own attempts", () => {
  const assignments = [
    assignment("assignment-tue", "Seshanba"),
    assignment("assignment-thu", "Payshanba"),
    assignment("assignment-sat", "Shanba"),
  ];
  const payload = buildAssignmentResults({
    students: [student],
    assignments,
    results: [
      result({ id: "attempt1", homeworkId: "assignment-tue", score: 5 }),
      result({ id: "attempt2", homeworkId: "assignment-thu", score: 6 }),
      result({ id: "attempt3", homeworkId: "assignment-sat", score: 7 }),
    ],
    writingResults: [],
  });

  assert.deepEqual(payload.map((item) => item.studentResults[0].sections.reading.attempts.map((attempt) => attempt.score)), [
    [5],
    [6],
    [7],
  ]);
});

test("same test reused in different homework keeps separate attempt history", () => {
  const payload = buildAssignmentResults({
    students: [student],
    assignments: [
      assignment("assignment-tue", "Seshanba"),
      assignment("assignment-thu", "Payshanba"),
    ],
    results: [
      result({ id: "attempt1", homeworkId: "assignment-tue", score: 4 }),
      result({ id: "attempt2", homeworkId: "assignment-tue", score: 6 }),
      result({ id: "attempt3", homeworkId: "assignment-thu", score: 8 }),
    ],
    writingResults: [],
  });

  assert.equal(payload[0].studentResults[0].sections.reading.attempts.length, 2);
  assert.equal(payload[1].studentResults[0].sections.reading.attempts.length, 1);
  assert.deepEqual(payload[1].studentResults[0].sections.reading.attempts.map((attempt) => attempt.score), [8]);
});

test("student and homework IDs both constrain returned attempts", () => {
  const payload = buildAssignmentResults({
    students: [student],
    assignments: [assignment("assignment-tue", "Seshanba")],
    results: [
      result({ id: "same-homework-other-student", homeworkId: "assignment-tue", userId: "student-2" }),
      result({ id: "other-homework", homeworkId: "assignment-thu" }),
      result({ id: "valid", homeworkId: "assignment-tue" }),
    ],
    writingResults: [],
  });

  assert.deepEqual(payload[0].studentResults[0].sections.reading.attempts.map((attempt) => attempt.id), ["valid"]);
});

test("historical results without homework ID are not guessed into a lesson", () => {
  const payload = buildAssignmentResults({
    students: [student],
    assignments: [assignment("assignment-tue", "Seshanba")],
    results: [result({ id: "legacy", homeworkId: null })],
    writingResults: [],
  });

  assert.deepEqual(payload[0].studentResults[0].sections.reading.attempts, []);
});

test("unassigned sections and students with no submission remain empty", () => {
  const item = assignment("assignment-tue", "Seshanba");
  item.readingTestId = "";
  item.listeningTestId = "listening-test";
  const payload = buildAssignmentResults({
    students: [student],
    assignments: [item],
    results: [],
    writingResults: [],
  });

  assert.equal(payload[0].studentResults[0].sections.reading.assigned, false);
  assert.equal(payload[0].studentResults[0].sections.listening.assigned, true);
  assert.deepEqual(payload[0].studentResults[0].sections.listening.attempts, []);
});

test("writing attempts awaiting the aggregate result are returned as evaluating", () => {
  const item = assignment("assignment-tue", "Seshanba");
  item.writingTestId = "writing-test";
  const payload = buildAssignmentResults({
    students: [student],
    assignments: [item],
    results: [],
    writingResults: [
      { userId: student.id, homeworkId: item._id, writingId: item.writingTestId, taskType: "task1", attemptKey: "writing-attempt" },
      { userId: student.id, homeworkId: item._id, writingId: item.writingTestId, taskType: "task2", attemptKey: "writing-attempt" },
    ],
  });

  const writingAttempts = payload[0].studentResults[0].sections.writing.attempts;
  assert.equal(writingAttempts.length, 1);
  assert.equal(writingAttempts[0].status, "evaluating");
});

test("a started writing result with task evaluations is shown as evaluating", () => {
  const item = assignment("assignment-tue", "Seshanba");
  item.writingTestId = "writing-test";
  const payload = buildAssignmentResults({
    students: [student],
    assignments: [item],
    results: [
      {
        _id: "writing-result",
        userId: student.id,
        homeworkId: item._id,
        moduleType: "Writing",
        testId: item.writingTestId,
        attemptKey: "writing-attempt",
        completedAt: null,
      },
    ],
    writingResults: [
      { userId: student.id, homeworkId: item._id, writingId: item.writingTestId, taskType: "task1", attemptKey: "writing-attempt" },
    ],
  });

  const writingAttempts = payload[0].studentResults[0].sections.writing.attempts;
  assert.equal(writingAttempts.length, 1);
  assert.equal(writingAttempts[0].status, "evaluating");
});

test("a homework assignment can only be used by a member for its assigned test", async () => {
  const assignedHomework = {
    _id: "507f1f77bcf86cd799439011",
    group: "slot-tue",
    teacher: "teacher-1",
    readingTestId: "shared-reading-test",
  };
  const studentRecord = {
    role: "student",
    teacher: "teacher-1",
    timeSlot: "slot-tue",
    timeSlots: ["slot-thu"],
  };
  const User = {
    findById: () => ({ select: async () => studentRecord }),
  };
  const Homework = {
    findOne: async (query) => {
      if (
        query._id === assignedHomework._id &&
        query.teacher === assignedHomework.teacher &&
        query.group.$in.includes(assignedHomework.group)
      ) {
        return assignedHomework;
      }
      return null;
    },
  };

  const valid = await findStudentHomeworkAssignment({
    User,
    Homework,
    studentId: student.id,
    homeworkId: assignedHomework._id,
    testId: assignedHomework.readingTestId,
    moduleType: "Reading",
  });
  const wrongTest = await findStudentHomeworkAssignment({
    User,
    Homework,
    studentId: student.id,
    homeworkId: assignedHomework._id,
    testId: "different-test",
    moduleType: "Reading",
  });
  const noAssignment = await findStudentHomeworkAssignment({
    User,
    Homework,
    studentId: student.id,
    homeworkId: "not-a-valid-id",
    testId: assignedHomework.readingTestId,
    moduleType: "Reading",
  });
  studentRecord.timeSlot = "another-teacher-slot";
  studentRecord.timeSlots = [];
  const unauthorizedGroup = await findStudentHomeworkAssignment({
    User,
    Homework,
    studentId: student.id,
    homeworkId: assignedHomework._id,
    testId: assignedHomework.readingTestId,
    moduleType: "Reading",
  });

  assert.equal(valid, assignedHomework);
  assert.equal(wrongTest, null);
  assert.equal(noAssignment, null);
  assert.equal(unauthorizedGroup, null);
});
