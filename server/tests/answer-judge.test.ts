// D4 純函數測試：判斷節流 + 免費預濾。
// judgeStudentAnswers 本身要打 LLM，呢度只驗「空輸入直接短路」；真正接線後先做 e2e。
import assert from "node:assert/strict";
import test from "node:test";
import {
  hasSubstantiveStudentInput,
  judgeStudentAnswers,
  shouldRunJudge,
} from "../lib/answer-judge.ts";

test("預濾：窗口冇實質學生輸入 → false", () => {
  assert.equal(
    hasSubstantiveStudentInput([
      { role: "student", content: "哦" },
      { role: "student", content: "唔知" },
    ]),
    false
  );
});

test("預濾：有實質學生輸入 → true", () => {
  assert.equal(
    hasSubstantiveStudentInput([
      { role: "student", content: "榫卯係唔使用釘嘅接合方法" },
    ]),
    true
  );
});

test("節流：未夠 3 輪唔跑", () => {
  assert.equal(
    shouldRunJudge(2, [{ role: "student", content: "榫卯係接合方法" }]),
    false
  );
});

test("節流＋預濾：夠鐘但窗口冇實質輸入 → 唔跑", () => {
  assert.equal(shouldRunJudge(3, [{ role: "student", content: "哦" }]), false);
});

test("節流＋預濾：夠鐘且有實質輸入 → 跑", () => {
  assert.equal(
    shouldRunJudge(3, [{ role: "student", content: "榫卯係接合方法" }]),
    true
  );
});

test("空輸入直接短路，唔打 LLM → null（caller 會 fallback）", async () => {
  const result = await judgeStudentAnswers({ points: [], turns: [] });
  assert.equal(result, null);
});
