import type { Request, Response } from 'express';
import { requireParam } from '@/utils/params';
import { ApiError } from '@/utils/apiError';
import * as enquiriesService from './enquiries.service';

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

const ENQUIRY_STATUSES = ['OPEN', 'FULFILLED'] as const;

function parseStatusFilter(req: Request): 'OPEN' | 'FULFILLED' | 'ALL' {
  const rawStatus = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'OPEN';
  if (rawStatus === 'ALL') return 'ALL';
  return (ENQUIRY_STATUSES as readonly string[]).includes(rawStatus) ? (rawStatus as 'OPEN' | 'FULFILLED') : 'OPEN';
}

export async function listEnquiriesHandler(req: Request, res: Response) {
  res.json(await enquiriesService.listEnquiries(parseStatusFilter(req)));
}

export async function createEnquiryHandler(req: Request, res: Response) {
  res.status(201).json(await enquiriesService.createEnquiry(req.body));
}

export async function confirmEnquiryHandler(req: Request, res: Response) {
  res.json(await enquiriesService.confirmEnquiry(requireUser(req), requireParam(req, 'id'), req.body));
}
