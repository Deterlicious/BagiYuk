import { z } from "zod";
import { sampleReceipt } from "@/data/sample-receipt";
import { itemAssignmentSchema, participantSchema } from "@/domain/billing/schemas";
import type { ItemAssignment, Participant } from "@/domain/billing/types";
import { editableReceiptSchema } from "@/domain/receipt/schemas";
import type { EditableReceipt } from "@/domain/receipt/types";

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export type DraftState = {
  version: 1;
  step: WizardStep;
  receipt: EditableReceipt;
  participants: Participant[];
  assignments: ItemAssignment[];
};

const blankConfidence = {
  statedSubtotal: 1,
  tax: 1,
  serviceCharge: 1,
  discount: 1,
  rounding: 1,
  receiptTotal: 1,
};

export function createEmptyReceipt(): EditableReceipt {
  return {
    merchantName: "",
    merchantConfidence: 1,
    items: [],
    charges: {
      statedSubtotal: 0,
      tax: 0,
      serviceCharge: 0,
      discount: 0,
      rounding: 0,
      receiptTotal: 0,
    },
    chargeConfidence: blankConfidence,
    source: "manual",
  };
}

export function createEmptyDraft(): DraftState {
  return {
    version: 1,
    step: 1,
    receipt: createEmptyReceipt(),
    participants: [],
    assignments: [],
  };
}

export function createSampleDraft(): DraftState {
  return {
    version: 1,
    step: 2,
    receipt: structuredClone(sampleReceipt),
    participants: [],
    assignments: [],
  };
}

export const draftStateSchema = z.object({
  version: z.literal(1),
  step: z.number().int().min(1).max(5).transform((step) => step as WizardStep),
  receipt: editableReceiptSchema,
  participants: z.array(participantSchema),
  assignments: z.array(itemAssignmentSchema),
});

export type DraftAction =
  | { type: "hydrate"; draft: DraftState }
  | { type: "set-step"; step: WizardStep }
  | { type: "set-receipt"; receipt: EditableReceipt }
  | { type: "set-participants"; participants: Participant[] }
  | { type: "set-assignments"; assignments: ItemAssignment[] }
  | { type: "reset" };

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "hydrate":
      return action.draft;
    case "set-step":
      return { ...state, step: action.step };
    case "set-receipt":
      return { ...state, receipt: action.receipt };
    case "set-participants":
      return { ...state, participants: action.participants };
    case "set-assignments":
      return { ...state, assignments: action.assignments };
    case "reset":
      return createEmptyDraft();
  }
}

export const DRAFT_STORAGE_KEY = "bagiyuk:draft:v1";
