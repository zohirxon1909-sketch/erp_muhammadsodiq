import { create } from 'zustand';
import { customersApi, debtApi } from '@/api/services';
import type { Customer, DebtHistoryEntry, Payment } from '@/types/entities';

export interface CreateCustomerInput {
  name: string;
  phone: string;
  notes?: string;
}

export interface RecordPaymentInput {
  amountUzs: number;
  method: Payment['method'];
  note?: string;
  recordedBy: string;
}

interface CustomerState {
  customers: Customer[];
  payments: Payment[];
  debtHistory: Record<string, DebtHistoryEntry[]>;
  isLoading: boolean;
  error: string | null;

  fetchCustomers: () => Promise<void>;
  fetchPayments: () => Promise<void>;
  fetchDebtHistory: (customerId: string) => Promise<void>;

  listCustomers: (includeArchived?: boolean) => Customer[];
  getCustomerById: (id: string) => Customer | undefined;
  createCustomer: (input: CreateCustomerInput) => Promise<Customer>;
  updateCustomer: (id: string, input: Partial<CreateCustomerInput>) => Promise<Customer>;
  archiveCustomer: (id: string) => Promise<void>;
  recordPayment: (customerId: string, input: RecordPaymentInput) => Promise<Payment>;
  getPaymentsByCustomer: (customerId: string) => Payment[];
  getDebtHistory: (customerId: string) => DebtHistoryEntry[];
}

const EMPTY_DEBT_HISTORY: DebtHistoryEntry[] = [];

const methodToApi = (m: Payment['method']): 'CASH' | 'CARD' | 'BANK_TRANSFER' => {
  if (m === 'card') return 'CARD';
  if (m === 'transfer') return 'BANK_TRANSFER';
  return 'CASH';
};

export const useCustomerStore = create<CustomerState>()((set, get) => ({
  customers: [],
  payments: [],
  debtHistory: {},
  isLoading: false,
  error: null,

  fetchCustomers: async () => {
    set({ isLoading: true, error: null });
    try {
      const customers = await customersApi.list();
      set({ customers, isLoading: false });
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: (err as { message?: string }).message ?? 'Mijozlar yuklanmadi',
      });
    }
  },

  fetchPayments: async () => {
    const payments = await debtApi.listPayments();
    set({ payments });
  },

  fetchDebtHistory: async (customerId: string) => {
    const history = await customersApi.getDebtHistory(customerId);
    set((s) => ({ debtHistory: { ...s.debtHistory, [customerId]: history } }));
  },

  listCustomers: (includeArchived = false) => {
    const list = get().customers;
    return includeArchived ? list : list.filter((c) => c.status !== 'archived');
  },

  getCustomerById: (id) => get().customers.find((c) => c.id === id),

  createCustomer: async (input) => {
    const customer = await customersApi.create(input);
    await get().fetchCustomers();
    return customer;
  },

  updateCustomer: async (id, input) => {
    const customer = await customersApi.update(id, input);
    await get().fetchCustomers();
    return customer;
  },

  archiveCustomer: async (id) => {
    await customersApi.delete(id);
    await get().fetchCustomers();
  },

  recordPayment: async (customerId, input) => {
    const payment = await debtApi.recordPayment(
      {
        customerId,
        amount: input.amountUzs,
        currency: 'UZS',
        paymentMethod: methodToApi(input.method),
        paymentType: 'PARTIAL',
        notes: input.note,
      },
      crypto.randomUUID(),
    );
    await Promise.all([get().fetchPayments(), get().fetchCustomers(), get().fetchDebtHistory(customerId)]);
    return payment;
  },

  getPaymentsByCustomer: (customerId) =>
    get().payments.filter((p) => p.customerId === customerId),

  getDebtHistory: (customerId) => get().debtHistory[customerId] ?? EMPTY_DEBT_HISTORY,
}));
