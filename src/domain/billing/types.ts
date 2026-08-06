export type ReceiptItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type Participant = {
  id: string;
  name: string;
};

export type ItemAssignment = {
  itemId: string;
  participantIds: string[];
  weights?: Record<string, number>;
};

export type ReceiptCharges = {
  statedSubtotal: number;
  tax: number;
  serviceCharge: number;
  discount: number;
  rounding: number;
  receiptTotal: number;
};

export type SplitInput = {
  items: ReceiptItem[];
  participants: Participant[];
  assignments: ItemAssignment[];
  charges: ReceiptCharges;
};

export type ParticipantItemShare = {
  itemId: string;
  name: string;
  amount: number;
};

export type ParticipantAllocation = {
  participant: Participant;
  items: ParticipantItemShare[];
  itemSubtotal: number;
  taxShare: number;
  serviceShare: number;
  discountShare: number;
  roundingShare: number;
  total: number;
};

export type Reconciliation = {
  calculatedSubtotal: number;
  statedSubtotal: number;
  subtotalDifference: number;
  allocatedTotal: number;
  receiptTotal: number;
  difference: number;
  isMatched: boolean;
};

export type SplitResult = {
  participants: ParticipantAllocation[];
  reconciliation: Reconciliation;
};
