const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreObjectiveTest } = require("../services/objectiveScoringService");
const Result = require("../models/Result");
const {
    saveReadingResult,
    saveListeningResult
} = require("../services/resultService");

const readingTest = (testText, questions) => ({
    passages: [{ testText, questions }]
});

const listeningTest = (testText, questions) => ({
    parts: [{ testText, questions }]
});

test("Reading fill-in answers normalize whitespace and capitalization", () => {
    const result = scoreObjectiveTest({
        test: readingTest("[[short]]", [{ value: "New   York" }]),
        answers: [["  NEW York  "]],
        moduleType: "Reading"
    });

    assert.equal(result.totalCorrect, 1);
    assert.equal(result.correctAnswers.length, 1);
});

test("Reading accepts configured answer variants, including numeric string equivalence", () => {
    const result = scoreObjectiveTest({
        test: readingTest("[[short]] [[short]]", [
            { answer: ["colour", "color"] },
            { value: "42" }
        ]),
        answers: [["COLOR", 42]],
        moduleType: "Reading"
    });

    assert.equal(result.totalCorrect, 2);
    assert.equal(result.totalQuestions, 2);
});

test("Reading combines legacy answer and acceptedAnswers fields as alternatives", () => {
    const result = scoreObjectiveTest({
        test: readingTest("[[short]]", [
            { value: "color", acceptedAnswers: ["colour"] }
        ]),
        answers: [["COLOUR"]],
        moduleType: "Reading"
    });

    assert.equal(result.totalCorrect, 1);
});

test("Reading accepts legacy slash-delimited alternative spellings", () => {
    const result = scoreObjectiveTest({
        test: readingTest("[[short]]", [{ value: "color/colour" }]),
        answers: [["colour"]],
        moduleType: "Reading"
    });

    assert.equal(result.totalCorrect, 1);
});

test("Reading does not award credit for incorrect, blank, or missing-key answers", () => {
    const result = scoreObjectiveTest({
        test: readingTest("[[short]] [[short]] [[short]]", [
            { value: "correct" },
            { value: "answered" },
            {}
        ]),
        answers: [["wrong", "", "anything"]],
        moduleType: "Reading"
    });

    assert.equal(result.totalCorrect, 0);
    assert.equal(result.totalQuestions, 3);
    assert.equal(result.hasAnswerKey, true);
    assert.equal(result.wrongAnswers.length, 3);
    assert.equal(result.wrongAnswers[1].userAnswer, "");
    assert.equal(result.wrongAnswers[2].correctAnswer, "");
});

test("Reading handles True/False/Not Given and Yes/No/Not Given as distinct question types", () => {
    const result = scoreObjectiveTest({
        test: readingTest(
            "[[tfng]] [[yn]] [[select:Yes|No|Not Given]]",
            [{ value: "TRUE" }, { value: "yes" }, { value: "Not Given" }]
        ),
        answers: [["True", "YES", "not   given"]],
        moduleType: "Reading"
    });

    assert.equal(result.totalCorrect, 3);
});

test("Reading matching and dropdown questions use normalized exact selection matching", () => {
    const result = scoreObjectiveTest({
        test: readingTest(
            "[[matchingheadings:A|B]] [[select:one|two|three]]",
            [{ value: "Heading A" }, { value: "Two" }]
        ),
        answers: [[" heading   a ", "TWO"]],
        moduleType: "Reading"
    });

    assert.equal(result.totalCorrect, 2);
});

test("Reading single choice requires an exact option and preserves punctuation", () => {
    const result = scoreObjectiveTest({
        test: readingTest("[[radio:A|B]] [[short]]", [
            { value: "A" },
            { value: "well-known" }
        ]),
        answers: [["A.", "well known"]],
        moduleType: "Reading"
    });

    assert.equal(result.totalCorrect, 0);
    assert.equal(result.wrongAnswers.length, 2);
});

test("Reading multi-select awards configured partial credit", () => {
    const result = scoreObjectiveTest({
        test: readingTest("[[multi:2:A|B|C]]", [{ answer: ["A", "C"] }]),
        answers: [["A, B"]],
        moduleType: "Reading"
    });

    assert.equal(result.totalCorrect, 1);
    assert.equal(result.totalQuestions, 2);
    assert.equal(result.correctAnswers.length, 0);
    assert.equal(result.wrongAnswers.length, 1);
});

test("Reading multi-select duplicate selections cannot earn extra credit", () => {
    const result = scoreObjectiveTest({
        test: readingTest("[[multi:2:A|B|C]]", [{ answer: ["A", "C"] }]),
        answers: [["A, A, C"]],
        moduleType: "Reading"
    });

    assert.equal(result.totalCorrect, 2);
    assert.equal(result.totalQuestions, 2);
});

test("Listening uses exact multi-select matching and counts unanswered questions", () => {
    const result = scoreObjectiveTest({
        test: listeningTest(
            "[[multi:2:A|B|C]] [[short]]",
            [{ value: "A, C" }, { value: "station" }]
        ),
        answers: [["C, A", ""]],
        moduleType: "Listening"
    });

    assert.equal(result.totalCorrect, 2);
    assert.equal(result.totalQuestions, 3);
    assert.equal(result.correctAnswers.length, 1);
    assert.equal(result.wrongAnswers.length, 1);
    assert.equal(result.wrongAnswers[0].userAnswer, "");
});

test("Listening does not award partial credit for an incomplete multi-select answer", () => {
    const result = scoreObjectiveTest({
        test: listeningTest("[[checkbox:2:A|B|C]]", [
            { acceptedAnswers: ["B", "C"] }
        ]),
        answers: [["B"]],
        moduleType: "Listening"
    });

    assert.equal(result.totalCorrect, 0);
    assert.equal(result.totalQuestions, 2);
    assert.equal(result.wrongAnswers.length, 1);
});

test("missing entire answer payload leaves all questions unanswered", () => {
    const result = scoreObjectiveTest({
        test: listeningTest("[[short]] [[yn]]", [
            { value: "answer" },
            { value: "Yes" }
        ]),
        moduleType: "Listening"
    });

    assert.equal(result.totalCorrect, 0);
    assert.equal(result.totalQuestions, 2);
    assert.equal(result.wrongAnswers.length, 2);
});

test("invalid question types never receive credit", () => {
    const result = scoreObjectiveTest({
        test: readingTest("[[unsupported]]", [{ value: "answer" }]),
        answers: [["answer"]],
        moduleType: "Reading"
    });

    assert.equal(result.totalCorrect, 0);
    assert.equal(result.wrongAnswers.length, 1);
});

test("saved and retrieved Reading scores retain backend grading", async () => {
    const originalFindOne = Result.findOne;
    const originalFindOneAndUpdate = Result.findOneAndUpdate;
    let stored;
    Result.findOne = async () => stored || null;
    Result.findOneAndUpdate = async (_filter, update) => {
        stored = update.$set;
        return stored;
    };

    try {
        const graded = scoreObjectiveTest({
            test: readingTest("[[short]]", [{ value: "answer" }]),
            answers: [[" ANSWER "]],
            moduleType: "Reading"
        });
        await saveReadingResult({
            userId: "student-id",
            testId: "test-id",
            testName: "Reading regression",
            attemptKey: "reading-regression-attempt",
            answers: [[" ANSWER "]],
            reading: {
                rawScore: graded.totalCorrect,
                rawTotal: graded.totalQuestions,
                academicBand: graded.academicBand,
                generalBand: graded.generalBand,
                passageScores: graded.groupScores,
                correctAnswers: graded.correctAnswers,
                wrongAnswers: graded.wrongAnswers
            }
        });

        const retrieved = await saveReadingResult({
            userId: "student-id",
            testName: "Reading regression",
            attemptKey: "reading-regression-attempt"
        });
        assert.equal(retrieved.reading.rawScore, 1);
        assert.equal(retrieved.reading.rawTotal, 1);
        assert.equal(retrieved.reading.correctAnswers.length, 1);
        assert.equal(retrieved.reading.wrongAnswers.length, 0);
    } finally {
        Result.findOne = originalFindOne;
        Result.findOneAndUpdate = originalFindOneAndUpdate;
    }
});

test("saved and retrieved Listening scores retain backend grading", async () => {
    const originalFindOne = Result.findOne;
    const originalFindOneAndUpdate = Result.findOneAndUpdate;
    let stored;
    Result.findOne = async () => stored || null;
    Result.findOneAndUpdate = async (_filter, update) => {
        stored = update.$set;
        return stored;
    };

    try {
        const graded = scoreObjectiveTest({
            test: listeningTest("[[short]]", [{ value: "station" }]),
            answers: [[" STATION "]],
            moduleType: "Listening"
        });
        await saveListeningResult({
            userId: "student-id",
            testId: "test-id",
            testName: "Listening regression",
            attemptKey: "listening-regression-attempt",
            answers: [[" STATION "]],
            listening: {
                rawScore: graded.totalCorrect,
                rawTotal: graded.totalQuestions,
                academicBand: graded.academicBand,
                generalBand: graded.generalBand,
                sectionScores: graded.groupScores,
                correctAnswers: graded.correctAnswers,
                wrongAnswers: graded.wrongAnswers
            }
        });

        const retrieved = await saveListeningResult({
            userId: "student-id",
            testName: "Listening regression",
            attemptKey: "listening-regression-attempt"
        });
        assert.equal(retrieved.listening.rawScore, 1);
        assert.equal(retrieved.listening.rawTotal, 1);
        assert.equal(retrieved.listening.correctAnswers.length, 1);
        assert.equal(retrieved.listening.wrongAnswers.length, 0);
    } finally {
        Result.findOne = originalFindOne;
        Result.findOneAndUpdate = originalFindOneAndUpdate;
    }
});
