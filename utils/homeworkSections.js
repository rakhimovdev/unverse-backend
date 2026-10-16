const normalizeSectionValue = (value) => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return normalizeSectionValue(value[0]);
  if (typeof value === "object") {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
  }
  return String(value).trim();
};

const pickSectionValue = (source, keys) => {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source || {}, key)) continue;
    const value = normalizeSectionValue(source[key]);
    if (value) return value;
  }
  return "";
};

const normalizeHomeworkSections = (payload = {}) => {
  const source = payload || {};
  const nestedSections = source.sections || source.sectionAssignments || {};
  const readingTestId =
    pickSectionValue(source, [
      "readingTestId",
      "readingId",
      "reading",
      "readingAssignmentId",
      "readingTaskId",
    ]) ||
    pickSectionValue(nestedSections, ["reading", "readingTest", "readingAssignment"]) ||
    (source.testType === "reading" ? normalizeSectionValue(source.testId) : "");

  const listeningTestId =
    pickSectionValue(source, [
      "listeningTestId",
      "listeningId",
      "listening",
      "listeningAssignmentId",
      "listeningTaskId",
    ]) ||
    pickSectionValue(nestedSections, ["listening", "listeningTest", "listeningAssignment"]) ||
    (source.testType === "listening" ? normalizeSectionValue(source.testId) : "");

  const writingTestId =
    pickSectionValue(source, [
      "writingTestId",
      "writingId",
      "writing",
      "writingAssignmentId",
      "writingTaskId",
    ]) ||
    pickSectionValue(nestedSections, ["writing", "writingTest", "writingAssignment"]) ||
    (source.testType === "writing" ? normalizeSectionValue(source.testId) : "");

  const extraInfo =
    typeof source.extraInfo === "string"
      ? source.extraInfo
      : typeof source.extraInformation === "string"
        ? source.extraInformation
        : typeof source.instructions === "string"
          ? source.instructions
          : "";

  return {
    readingTestId,
    listeningTestId,
    writingTestId,
    extraInfo,
    sectionCount: [readingTestId, listeningTestId, writingTestId].filter(Boolean).length,
  };
};

const serializeHomeworkForStudent = (item = {}) => {
  const normalized = normalizeHomeworkSections(item);
  const readValue = (field, fallback = "") => {
    const value = item?.[field];
    return value === undefined || value === null ? fallback : String(value);
  };

  return {
    id: String(item._id || item.id || ""),
    title: readValue("title", ""),
    instructions: readValue("instructions", ""),
    extraInfo: readValue("extraInfo", normalized.extraInfo || ""),
    groupName: readValue("groupName", ""),
    lessonDay: readValue("lessonDay", ""),
    lessonDate: readValue("lessonDate", ""),
    lessonTime: readValue("lessonTime", ""),
    dueDate: readValue("dueDate", ""),
    dueTime: readValue("dueTime", ""),
    createdAt: item.createdAt,
    assignedAt: item.assignedAt,
    readingTestId: normalized.readingTestId,
    listeningTestId: normalized.listeningTestId,
    writingTestId: normalized.writingTestId,
    sections: {
      reading: normalized.readingTestId ? { testId: normalized.readingTestId } : null,
      listening: normalized.listeningTestId ? { testId: normalized.listeningTestId } : null,
      writing: normalized.writingTestId ? { testId: normalized.writingTestId } : null,
    },
  };
};

module.exports = {
  normalizeHomeworkSections,
  serializeHomeworkForStudent,
};
