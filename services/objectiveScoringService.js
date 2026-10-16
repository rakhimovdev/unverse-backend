const {
    READING_ACADEMIC_TABLE,
    READING_GENERAL_TABLE,
    LISTENING_BAND_TABLE,
    getBandScore
} = require("../utils/ieltsBands");

const TOKEN_PATTERN = /\[\[([^\]]+)\]\]/g;
const INPUT_TYPES = new Set([
    "input",
    "short",
    "shortanswer",
    "sentence",
    "sentencecompletion",
    "table",
    "tablecompletion",
    "diagram",
    "diagramlabel",
    "flow",
    "flowchart",
    "summary",
    "summarycompletion"
]);

const normalizeText = (value) =>
    String(value ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

const normalizeType = (value) =>
    String(value || "")
        .toLowerCase()
        .replace(/&nbsp;/g, " ")
        .replace(/[^a-z0-9]/g, "");

const splitDelimitedAnswers = (value, allowSpacedSlash = true) => {
    if (Array.isArray(value)) {
        return value.flatMap((item) => splitDelimitedAnswers(item, allowSpacedSlash));
    }
    if (value == null || typeof value === "object") return [];

    const text = String(value);
    const separator = allowSpacedSlash ? /[,|&+]|\s+\/\s+/ : /[,|&+]/;
    return text.split(separator).map((item) => item.trim()).filter(Boolean);
};

const parseToken = (rawToken, moduleType) => {
    const [rawType, rawOptions = ""] = rawToken.split(/:(.*)/s);
    const type = normalizeType(rawType);

    if (INPUT_TYPES.has(type) || ["textarea", "long", "longanswer", "paragraph"].includes(type)) {
        return { kind: "fill", label: type };
    }
    if (["yn", "ynng", "yesno", "yesnonotgiven"].includes(type)) {
        return { kind: "yesno", label: type };
    }
    if (["tfng", "truefalse", "truefalsenotgiven"].includes(type)) {
        return { kind: "truefalse", label: type };
    }
    if (["matchingheadings", "matching", "match", "headings", "heading"].includes(type)) {
        return { kind: "matching", label: type };
    }
    if (["radio", "redio", "mc", "multiplechoice", "select"].includes(type)) {
        return { kind: "single", label: type };
    }

    const listeningMultiTypes = ["multi", "multi2", "choose2", "twoselect", "checkbox"];
    if (listeningMultiTypes.includes(type)) {
        const parts = rawOptions.trim().split(/:(.+)/s);
        const explicitMax = Number.parseInt(parts[0], 10);
        const fallbackMax = moduleType === "Listening" ? 2 : 2;
        return {
            kind: "multi",
            label: type,
            weight:
                Number.isFinite(explicitMax) && explicitMax > 0
                    ? explicitMax
                    : fallbackMax
        };
    }
    return { kind: "invalid", label: type || "invalid" };
};

const getGroups = (test, moduleType) => {
    const groups =
        moduleType === "Reading"
            ? test.passages
            : test.parts?.length
                ? test.parts
                : null;
    if (Array.isArray(groups) && groups.length) return groups;
    return [{ questions: test.questions || [], testText: test.testText || "" }];
};

const getGroupQuestions = (group) => group?.questions || [];

const getQuestionDefs = (group, moduleType) => {
    const text = String(group?.testText || "");
    const tokens = Array.from(text.matchAll(TOKEN_PATTERN), (match) =>
        parseToken(match[1], moduleType)
    );
    if (tokens.length) return tokens;

    return getGroupQuestions(group).map((question) => ({
        kind:
            normalizeType(question?.type) === "multi"
                ? "multi"
                : !["single", "text", "fill", "select", "yn", "truefalse", "matching", "heading"].includes(
                    normalizeType(question?.type)
                )
                    ? "invalid"
                    : "single",
        label: normalizeType(question?.type) || "single",
        weight: normalizeType(question?.type) === "multi" ? 2 : 1
    }));
};

const getAnswerKey = (question) => {
    if (!question || typeof question !== "object") return undefined;
    const values = [
        question.value,
        question.answer,
        question.acceptedAnswers,
        question.answers
    ].filter((value) =>
        value !== undefined &&
        value !== null &&
        (Array.isArray(value)
            ? value.some((item) => item != null && String(item).trim() !== "")
            : String(value).trim() !== "")
    );
    return values.length ? values : undefined;
};

const displayAnswerKey = (value) =>
    splitDelimitedAnswers(value).join(" / ");

const flattenAnswerValues = (value) => {
    if (Array.isArray(value)) return value.flatMap(flattenAnswerValues);
    if (value == null || typeof value === "object") return [];
    return String(value).split(/[|/]/);
};

const getExpectedAnswers = (key) => {
    const source =
        key && typeof key === "object" && !Array.isArray(key)
            ? key.acceptedAnswers ?? key.answers ?? key.answer ?? key.value
            : key;
    return flattenAnswerValues(source)
        .map(normalizeText)
        .filter(Boolean);
};

const getMultiSelections = (value) =>
    Array.from(
        new Set(
            splitDelimitedAnswers(flattenAnswerValues(value), true)
                .map(normalizeText)
                .filter(Boolean)
        )
    );

const isCorrectSingle = (userAnswer, key) => {
    const normalizedUser = normalizeText(userAnswer);
    if (!normalizedUser || key == null) return false;
    return getExpectedAnswers(key).includes(normalizedUser);
};

const scoreMulti = (userAnswer, key, moduleType, weight) => {
    const submitted = getMultiSelections(userAnswer);
    const keyValue =
        key && typeof key === "object" && !Array.isArray(key)
            ? key.answer ?? key.answers ?? key.acceptedAnswers ?? key.value
            : key;
    const expected = Array.from(new Set(getMultiSelections(keyValue)));
    if (!submitted.length || !expected.length) return 0;

    const expectedSet = new Set(expected);
    if (moduleType === "Listening") {
        return submitted.length === expected.length &&
            submitted.every((answer) => expectedSet.has(answer))
            ? weight
            : 0;
    }

    return Math.min(
        weight,
        submitted.reduce((total, answer) => total + Number(expectedSet.has(answer)), 0)
    );
};

const scoreObjectiveTest = ({ test, answers, moduleType }) => {
    if (!test || !["Reading", "Listening"].includes(moduleType)) {
        throw new TypeError("A Reading or Listening test is required for objective scoring.");
    }

    const groups = getGroups(test, moduleType);
    const answerGroups = Array.isArray(answers) ? answers : [];
    let questionNumber = 0;
    let totalCorrect = 0;
    let totalQuestions = 0;
    let hasAnswerKey = false;
    const correctAnswers = [];
    const wrongAnswers = [];
    const groupScores = groups.map((group, groupIndex) => {
        const questions = getGroupQuestions(group);
        const defs = getQuestionDefs(group, moduleType);
        const questionCount = defs.length || questions.length;
        const submittedGroup = Array.isArray(answerGroups[groupIndex])
            ? answerGroups[groupIndex]
            : [];
        let groupCorrect = 0;
        let groupTotal = 0;

        for (let index = 0; index < questionCount; index += 1) {
            questionNumber += 1;
            const definition = defs[index] || { kind: "invalid", label: "invalid" };
            const question = questions[index] || {};
            const key = getAnswerKey(question);
            const userAnswer = submittedGroup[index];
            const weight =
                moduleType === "Reading" && definition.kind === "multi"
                    ? Math.max(1, Number(definition.weight) || 2)
                    : moduleType === "Listening" && definition.kind === "multi"
                        ? 2
                        : 1;
            const hasKey =
                key !== undefined &&
                key !== null &&
                (Array.isArray(key) ? key.length > 0 : String(key).trim() !== "");
            if (hasKey) hasAnswerKey = true;

            groupTotal += weight;
            totalQuestions += weight;
            let earned = 0;
            if (definition.kind === "multi") {
                earned = scoreMulti(userAnswer, key, moduleType, weight);
            } else if (definition.kind !== "invalid" && hasKey && isCorrectSingle(userAnswer, key)) {
                earned = 1;
            }

            const label = moduleType === "Reading" ? "Passage" : "Section";
            const item = {
                questionNumber,
                groupNumber: groupIndex + 1,
                label: `${label} ${groupIndex + 1} · Q${questionNumber}`,
                prompt: question.question || `Question ${questionNumber}`,
                questionType: definition.label,
                userAnswer: userAnswer == null ? "" : String(userAnswer),
                correctAnswer: displayAnswerKey(key),
                explanation: hasKey
                    ? `Correct answer: ${displayAnswerKey(key)}. Review the relevant ${label.toLowerCase()} ${groupIndex + 1}.`
                    : "No official answer key was provided for this item."
            };

            if (earned > 0) {
                totalCorrect += earned;
                groupCorrect += earned;
            }
            if (earned === weight && weight > 0) {
                correctAnswers.push(item);
            } else {
                wrongAnswers.push(item);
            }
        }

        return {
            label: `${moduleType === "Reading" ? "Passage" : "Section"} ${groupIndex + 1}`,
            correct: groupCorrect,
            total: groupTotal
        };
    });

    const bandTableAcademic =
        moduleType === "Reading" ? READING_ACADEMIC_TABLE : LISTENING_BAND_TABLE;
    const academicBand =
        totalQuestions === 40 ? getBandScore(totalCorrect, bandTableAcademic) : null;
    const generalBand =
        moduleType === "Reading" && totalQuestions === 40
            ? getBandScore(totalCorrect, READING_GENERAL_TABLE)
            : academicBand;

    return {
        totalCorrect,
        totalQuestions,
        groupScores,
        academicBand,
        generalBand,
        hasAnswerKey,
        correctAnswers,
        wrongAnswers
    };
};

module.exports = { scoreObjectiveTest };
