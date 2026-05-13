export type Problem = {
  id: string;
  vol: number;
  indexInVol: number;
  predictedProblemText: string;
  canonicalPolicy: string;
  /** 1-based page in public/focusgold/{vol}.pdf */
  answerPdfPage: number;
};

export type GradeResult = {
  score: number;
  maxScore: number;
  points: string[];
  analysis: string;
  rubricHits?: Record<string, boolean>;
};

export type SessionPayloadV1 = {
  version: 1;
  queue: string[];
  index: number;
  random: boolean;
};
