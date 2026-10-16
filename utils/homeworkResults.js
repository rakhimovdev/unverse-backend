const sectionConfig = {
  Reading: { key: "reading", testField: "readingTestId" },
  Listening: { key: "listening", testField: "listeningTestId" },
  Writing: { key: "writing", testField: "writingTestId" },
};

const getScore = (result, moduleType) => {
  if (moduleType === "Reading") {
    return result.reading?.academicBand ?? result.reading?.generalBand ?? result.overallBand ?? null;
  }
  if (moduleType === "Listening") {
    return result.listening?.academicBand ?? result.listening?.generalBand ?? result.overallBand ?? null;
  }
  return result.writing?.overallBand ?? result.overallBand ?? null;
};

const buildAssignmentResults = ({ students, assignments, results, writingResults }) =>
  assignments.map((assignment) => {
    const assignedTestIds = Object.fromEntries(
      Object.entries(sectionConfig).map(([moduleType, config]) => [
        moduleType,
        String(assignment[config.testField] || ""),
      ])
    );

    const studentResults = students.map((student) => {
      const attempts = {};
      for (const [moduleType, config] of Object.entries(sectionConfig)) {
        const testId = assignedTestIds[moduleType];
        const matchingResults = testId
          ? results
              .filter(
                (result) =>
                  String(result.userId) === student.id &&
                  String(result.homeworkId) === String(assignment._id) &&
                  result.moduleType === moduleType &&
                  String(result.testId || "") === testId
              )
              .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
          : [];
        const pendingWritingResults =
          moduleType === "Writing" && testId
            ? writingResults.filter(
                (result) =>
                  String(result.userId) === student.id &&
                  String(result.homeworkId) === String(assignment._id) &&
                  String(result.writingId || "") === testId &&
                  result.taskType !== "overall"
              )
            : [];
        const pendingWritingAttemptKeys = new Set(
          pendingWritingResults.map((result) => String(result.attemptKey || "")).filter(Boolean)
        );

        attempts[config.key] = {
          assigned: Boolean(testId),
          attempts: matchingResults.map((result) => ({
            id: String(result._id),
            status: result.completedAt
              ? "completed"
              : pendingWritingAttemptKeys.has(String(result.attemptKey || ""))
                ? "evaluating"
                : "in_progress",
            score: getScore(result, moduleType),
            timeSpent: Number(result.timeSpent) || 0,
            completedAt: result.completedAt || null,
          })),
        };

        if (moduleType === "Writing" && testId) {
          const completedAttemptKeys = new Set(
            matchingResults.map((result) => String(result.attemptKey || "")).filter(Boolean)
          );
          const pendingAttempts = new Map();

          pendingWritingResults
            .filter((result) => !completedAttemptKeys.has(String(result.attemptKey || "")))
            .forEach((result) => {
              const attemptKey = String(result.attemptKey || result._id);
              pendingAttempts.set(attemptKey, {
                id: attemptKey,
                status: "evaluating",
                score: null,
                timeSpent: 0,
                completedAt: null,
              });
            });

          attempts.writing.attempts.push(...pendingAttempts.values());
          attempts.writing.attempts.sort(
            (first, second) => new Date(second.completedAt || 0) - new Date(first.completedAt || 0)
          );
        }
      }

      return { studentId: student.id, sections: attempts };
    });

    return {
      id: String(assignment._id),
      title: assignment.title,
      instructions: assignment.instructions || "",
      extraInfo: assignment.extraInfo || "",
      lessonDate: assignment.lessonDate || "",
      lessonTime: assignment.lessonTime || "",
      dueDate: assignment.dueDate || "",
      dueTime: assignment.dueTime || "",
      readingTestId: assignment.readingTestId || "",
      listeningTestId: assignment.listeningTestId || "",
      writingTestId: assignment.writingTestId || "",
      createdAt: assignment.createdAt,
      assignedAt: assignment.assignedAt,
      status: "Vazifa berilgan",
      studentResults,
    };
  });

module.exports = { buildAssignmentResults };
