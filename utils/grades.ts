// 年級帶（對話 bot 語言難度）——5 帶 = 官方 4 學習階段 + 拆出 P1
//
// 官方依據：《中國語文教育學習領域課程指引（小一至中六）》(2017)、
// 學習進程架構（LPF）、《小學中國語文建議學習重點》(2023)、
// 《香港小學學習字詞表》(2007)。
//
// ⚠️ 句長／回覆字數／英語詞數全部係**工程建議值**，冇官方依據，
//    上線後應按實際學生反應 A/B 調參。標點與字表範圍才有官方依據。
//
// 年級帶只調「難度」（句長、詞彙深淺、標點），**不改變回覆語言** ——
// 產品語音輸入輸出支援粵語口語／普通話／英語三種，語言由 bot 的
// replyLanguage 決定，三種語言一律套用同一個年級帶的難度限制。
export type GradeBandValue = "P1" | "P2-P3" | "P4-P6" | "S1-S3" | "S4-S6";

export type GradeBandOption = {
  value: GradeBandValue;
  /** 中文顯示名（uiText 會查 utils/uiEnglish.ts 取英文） */
  label: string;
  /** 官方學習階段（第一至第四） */
  stage: string;
  /** 每句字數上限（中文） */
  maxCharsPerSentence: number;
  /** 每回覆句數上限 */
  maxSentences: number;
  /** 每回覆總字數上限（中文） */
  maxReplyChars: number;
  /** 英語回覆每句詞數上限（約中文一半，工程換算值） */
  maxWordsPerSentence: number;
  /** 可用標點範圍（直接寫入 prompt） */
  punctuation: string;
  /** 詞彙與抽象度（直接寫入 prompt） */
  vocabulary: string;
  /** L2 生字率檢查是否有官方字表可查（S 帶冇字表，不查） */
  hasVocabularyList: boolean;
};

export const GRADE_BANDS: GradeBandOption[] = [
  {
    value: "P1",
    label: "小一",
    stage: "第一學習階段",
    maxCharsPerSentence: 12,
    maxSentences: 2,
    maxReplyChars: 40,
    maxWordsPerSentence: 6,
    punctuation: "只可用句號、逗號、問號、感嘆號",
    vocabulary: "只用最具體、日常生活直接可見的詞語；不可用比喻、成語、抽象名詞",
    hasVocabularyList: true,
  },
  {
    value: "P2-P3",
    label: "小二至小三",
    stage: "第一學習階段",
    maxCharsPerSentence: 18,
    maxSentences: 3,
    maxReplyChars: 70,
    maxWordsPerSentence: 9,
    punctuation:
      "可用句號、逗號、問號、感嘆號、頓號、省略號、書名號、專名號；冒號與引號只限直接引述說話時使用",
    vocabulary: "以具體詞語為主，可用簡單比喻；避免抽象名詞與成語",
    hasVocabularyList: true,
  },
  {
    value: "P4-P6",
    label: "小四至小六",
    stage: "第二學習階段",
    maxCharsPerSentence: 28,
    maxSentences: 4,
    maxReplyChars: 120,
    maxWordsPerSentence: 14,
    punctuation: "可用小學階段全部 13 種標點，包括括號、分號、破折號",
    vocabulary: "可作初步抽象說明，可用簡單成語；重要概念先用例子解釋",
    hasVocabularyList: true,
  },
  {
    value: "S1-S3",
    label: "中一至中三",
    stage: "第三學習階段",
    maxCharsPerSentence: 40,
    maxSentences: 5,
    maxReplyChars: 200,
    maxWordsPerSentence: 20,
    punctuation: "標點不限，可用着重號、連接號、間隔號",
    vocabulary: "可用抽象概念與學科術語，可引簡短文言文並附白話解釋",
    hasVocabularyList: false,
  },
  {
    value: "S4-S6",
    label: "中四至中六",
    stage: "第四學習階段",
    maxCharsPerSentence: 55,
    maxSentences: 6,
    maxReplyChars: 300,
    maxWordsPerSentence: 27,
    punctuation: "標點不限",
    vocabulary: "可用學術語域，鼓勵批判性分析與多角度比較",
    hasVocabularyList: false,
  },
];

/** 冇設定年級時的 fallback 帶（P4-P6，字量覆蓋全小學 3,171 字） */
export const DEFAULT_GRADE_BAND: GradeBandValue = "P4-P6";

export function gradeBandOf(grade?: string | null): GradeBandOption | null {
  const value = String(grade || "").trim();
  if (!value) return null;
  return GRADE_BANDS.find((band) => band.value === value) ?? null;
}

export function gradeBandLabelOf(grade?: string | null): string {
  return gradeBandOf(grade)?.label ?? "";
}
