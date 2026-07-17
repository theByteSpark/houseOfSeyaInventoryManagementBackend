import type { Request, Response } from 'express';
import { requireParam } from '@/utils/params';
import * as usersService from './users.service';

export async function listUsersHandler(_req: Request, res: Response) {
  res.json(await usersService.listUsers());
}

export async function getUserHandler(req: Request, res: Response) {
  res.json(await usersService.getUser(requireParam(req, 'id')));
}

export async function updateUserHandler(req: Request, res: Response) {
  res.json(await usersService.updateUser(requireParam(req, 'id'), req.body));
}

export async function deleteUserHandler(req: Request, res: Response) {
  await usersService.deleteUser(requireParam(req, 'id'));
  res.status(204).send();
}
