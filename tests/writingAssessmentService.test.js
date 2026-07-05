process.env.WRITING_AI_DEBUG = "0";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildOverallAssessmentFromTasks,
    gradeWritingEssay,
    normalizeAssessment,
    roundIeltsOverallBand
} = require("../services/writingAssessmentService");

const buildTask1Payload = (overrides = {}) => ({
    taskType: "Task 1",
    scores: {
        taskAchievement: 8,
        coherence: 8,
        lexical: 8,
        grammar: 8,
        overall: 8,
        ...(overrides.scores || {})
    },
    strengths: ["Clear overview of the main trends."],
    weaknesses: ["The final comparison could be more precise."],
    criterionFeedback: {
        taskAchievement: {
            band: 8,
            analysis: "All key features are covered with a clear overview.",
            evidence: ["The overview states that exports rose while imports fell."]
        },
        coherence: {
            band: 8,
            analysis: "Information is sequenced logically across paragraphs.",
            evidence: ["The essay moves from overview to detailed comparisons."]
        },
        lexical: {
            band: 8,
            analysis: "Vocabulary is varied and generally precise.",
            evidence: ["The report uses 'fluctuated' and 'surpassed' appropriately."]
        },
        grammar: {
            band: 8,
            analysis: "A good range of complex structures is used accurately.",
            evidence: ["There are several accurate complex comparison sentences."]
        },
        ...(overrides.criterionFeedback || {})
    },
    grammarCorrections: [],
    vocabularySuggestions: [],
    estimatedExaminerComment: "A strong Task 1 response.",
    ...overrides
});

const buildTask2Payload = (overrides = {}) => ({
    taskType: "Task 2",
    scores: {
        taskResponse: 8,
        coherence: 8,
        lexical: 8,
        grammar: 8,
        overall: 8,
        ...(overrides.scores || {})
    },
    strengths: ["The position is clear and well supported."],
    weaknesses: ["One counterargument could be developed further."],
    criterionFeedback: {
        taskResponse: {
            band: 8,
            analysis: "The essay answers all parts of the question with clear support.",
            evidence: ["The writer states a clear view in the introduction and conclusion."]
        },
        coherence: {
            band: 8,
            analysis: "Ideas progress logically and paragraphing is effective.",
            evidence: ["Each body paragraph develops one central idea."]
        },
        lexical: {
            band: 8,
            analysis: "There is a wide range of vocabulary with only minor awkwardness.",
            evidence: ["The essay uses terms such as 'detrimental' and 'allocation' naturally."]
        },
        grammar: {
            band: 8,
            analysis: "Complex structures are handled well with only minor slips.",
            evidence: ["Conditional and relative clauses are used accurately."]
        },
        ...(overrides.criterionFeedback || {})
    },
    grammarCorrections: [],
    vocabularySuggestions: [],
    estimatedExaminerComment: "A strong Task 2 response.",
    ...overrides
});

const createMockClient = (attempts) => {
    const state = { calls: 0 };

    return {
        state,
        responses: {
            create: async () => {
                const current = attempts[state.calls] || attempts[attempts.length - 1];
                state.calls += 1;

                return {
                    output_parsed: current.parsed,
                    output_text: current.rawText || "",
                    output: current.output || []
                };
            }
        }
    };
};

test("strong Task 2 essays are not forced to overall 6.5", async () => {
    const client = createMockClient([
        {
            parsed: buildTask2Payload({
                scores: {
                    taskResponse: 8,
                    coherence: 8,
                    lexical: 8,
                    grammar: 8,
                    overall: 8
                }
            })
        }
    ]);

    const result = await gradeWritingEssay({
        client,
        model: "gpt-4.1",
        essay: "A strong task 2 essay with a clear thesis, relevant support and advanced vocabulary.",
        taskType: "task2",
        question: "Discuss both views and give your opinion.",
        language: "en"
    });

    assert.equal(result.scores.taskResponse, 8);
    assert.equal(result.scores.overall, 8);
    assert.notEqual(result.scores.overall, 6.5);
});

test("strong Task 1 essays keep Task Achievement instead of being flattened", async () => {
    const client = createMockClient([{ parsed: buildTask1Payload() }]);

    const result = await gradeWritingEssay({
        client,
        model: "gpt-4.1",
        essay: "A clear Task 1 report with an overview and accurate comparisons.",
        taskType: "task1",
        question: "Summarise the information by selecting and reporting the main features.",
        language: "en"
    });

    assert.equal(result.scores.taskAchievement, 8);
    assert.equal(result.scores.taskResponse, null);
    assert.equal(result.scores.overall, 8);
});

test("invalid AI JSON retries once before succeeding", async () => {
    const repairedPayload = buildTask2Payload({
        scores: {
            taskResponse: 7,
            coherence: 7.5,
            lexical: 7,
            grammar: 7.5,
            overall: 7.5
        }
    });

    const client = createMockClient([
        {
            parsed: undefined,
            rawText: "not valid json"
        },
        {
            parsed: undefined,
            rawText: JSON.stringify(repairedPayload)
        }
    ]);

    const result = await gradeWritingEssay({
        client,
        model: "gpt-4.1",
        essay: "Essay text",
        taskType: "task2",
        question: "Question",
        language: "en"
    });

    assert.equal(client.state.calls, 2);
    assert.equal(result.scores.overall, 7.5);
});

test("retry failure returns an error instead of a fake fallback score", async () => {
    const client = createMockClient([
        { parsed: undefined, rawText: "bad json" },
        { parsed: undefined, rawText: "still bad" }
    ]);

    await assert.rejects(
        () =>
            gradeWritingEssay({
                client,
                model: "gpt-4.1",
                essay: "Essay text",
                taskType: "task2",
                question: "Question",
                language: "en"
            }),
        /invalid/i
    );
});

test("overall band is calculated with IELTS half-band rounding", () => {
    const assessment = normalizeAssessment(
        buildTask2Payload({
            scores: {
                taskResponse: 7,
                coherence: 7.5,
                lexical: 7,
                grammar: 7.5,
                overall: 0
            }
        }),
        {
            taskType: "task2",
            essay: "This essay has enough words to count."
        }
    );

    assert.equal(assessment.scores.overall, 7.5);
    assert.equal(roundIeltsOverallBand(7.125), 7);
    assert.equal(roundIeltsOverallBand(6.625), 6.5);
});

test("Task 1 and Task 2 criteria are not mixed", () => {
    const task1 = normalizeAssessment(buildTask1Payload(), {
        taskType: "task1",
        essay: "Task 1 essay text."
    });
    const task2 = normalizeAssessment(buildTask2Payload(), {
        taskType: "task2",
        essay: "Task 2 essay text."
    });

    assert.ok(task1.criterionFeedback.taskAchievement);
    assert.equal(task1.criterionFeedback.taskResponse, null);
    assert.ok(task2.criterionFeedback.taskResponse);
    assert.equal(task2.criterionFeedback.taskAchievement, null);
});

test("invalid structured assessments do not silently become 6.5", async () => {
    const invalidPayload = buildTask2Payload({
        scores: {
            taskResponse: 8,
            coherence: 8,
            lexical: 8
        }
    });
    delete invalidPayload.scores.grammar;

    const client = createMockClient([
        { parsed: invalidPayload },
        { parsed: invalidPayload }
    ]);

    await assert.rejects(
        () =>
            gradeWritingEssay({
                client,
                model: "gpt-4.1",
                essay: "Essay text",
                taskType: "task2",
                question: "Question",
                language: "en"
            }),
        /criterion scores/i
    );
});

test("combined writing assessment keeps Task 1 and Task 2 separate while weighting Task 2 double", () => {
    const overall = buildOverallAssessmentFromTasks(
        {
            taskType: "task1",
            scores: {
                taskAchievement: 7,
                coherence: 7,
                lexical: 7,
                grammar: 7,
                overall: 7
            },
            strengths: ["Task 1 strength"],
            weaknesses: ["Task 1 weakness"],
            criterionFeedback: buildTask1Payload().criterionFeedback
        },
        {
            taskType: "task2",
            scores: {
                taskResponse: 8,
                coherence: 8,
                lexical: 8,
                grammar: 8,
                overall: 8
            },
            strengths: ["Task 2 strength"],
            weaknesses: ["Task 2 weakness"],
            criterionFeedback: buildTask2Payload().criterionFeedback
        }
    );

    assert.equal(overall.scores.taskAchievement, 7);
    assert.equal(overall.scores.taskResponse, 8);
    assert.equal(overall.scores.coherence, 7.5);
    assert.equal(overall.scores.overall, 7.5);
});
