import { NotFoundError } from "../../../lib/errors";
import type { EnvBindings } from "../../../lib/app-env";
import { getPaperFile as getStoredPaperFile } from "../../../platform/storage";
import { papersRepository } from "../repository";

export const papersService = {
  browse: async (db: D1Database, institutionId: string, query?: string) => {
    return await papersRepository.list(db, institutionId, query);
  },
  getPaper: async (db: D1Database, institutionId: string, paperId: string) => {
    const paper = await papersRepository.findById(db, paperId);

    if (!paper || paper.institutionId !== institutionId) {
      throw new NotFoundError("Paper was not found.");
    }

    return paper;
  },
  getPaperFile: async (db: D1Database, institutionId: string, paperId: string, env: EnvBindings) => {
    const paper = await papersService.getPaper(db, institutionId, paperId);
    const object = await getStoredPaperFile(env, paper.fileKey);

    if (!object) {
      throw new NotFoundError("Paper file was not found.");
    }

    return {
      paper,
      object
    };
  }
};
