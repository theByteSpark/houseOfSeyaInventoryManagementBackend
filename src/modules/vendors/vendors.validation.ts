import { z } from 'zod';

export const vendorInputSchema = z.object({
  companyName: z.string().min(1),
  contactPerson: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export type VendorInput = z.infer<typeof vendorInputSchema>;
