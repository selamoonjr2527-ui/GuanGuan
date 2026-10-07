export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type PaymentMethod =
  | 'promptpay'
  | 'transfer'
  | 'cash';

export interface PaymentTransaction {
  id: string;

  playerId: string;
  nickname?: string;

  sessionDate: string;
  amount: number;
  currency: 'THB';

  status: PaymentStatus;

  paymentMethod: PaymentMethod;
  provider: '2c2p';

  transactionRef?: string;

  createdAt?: number;
  paidAt?: number;
}

export interface CreatePendingPaymentInput {
  playerId: string;
  nickname?: string;
  sessionDate: string;
  amount: number;
  paymentMethod?: PaymentMethod;
}
