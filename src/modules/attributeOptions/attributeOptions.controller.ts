import type { Request, Response } from 'express';
import { requireParam } from '@/utils/params';
import * as attributeOptionsService from './attributeOptions.service';
import { attributeTypeSchema } from './attributeOptions.validation';

export async function listAttributeOptionsHandler(req: Request, res: Response) {
  const parsedType = attributeTypeSchema.safeParse(req.query.type);
  const type = parsedType.success ? parsedType.data : undefined;
  res.json(await attributeOptionsService.listAttributeOptions(type));
}

export async function createAttributeOptionHandler(req: Request, res: Response) {
  res.status(201).json(await attributeOptionsService.createAttributeOption(req.body));
}

export async function updateAttributeOptionHandler(req: Request, res: Response) {
  res.json(await attributeOptionsService.updateAttributeOption(requireParam(req, 'id'), req.body));
}

export async function deleteAttributeOptionHandler(req: Request, res: Response) {
  await attributeOptionsService.deleteAttributeOption(requireParam(req, 'id'));
  res.status(204).send();
}
