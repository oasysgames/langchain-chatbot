// src/routes/exampleRoute.ts
import { Router, Request, Response } from 'express';

const router = Router();

router.get('/example', (req: Request, res: Response) => {
  console.log('This is an example route!');
  res.json({ message: 'This is an example route!' });
});

export default router;
