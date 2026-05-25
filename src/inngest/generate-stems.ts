import { inngest } from "@/lib/inngest";
import { prisma } from "@/lib/prisma";
import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });

export const generateStems = inngest.createFunction(
  {
    id: "generate-stems",
    retries: 2,
    triggers: [{ event: "generation/requested" }],
  } as any,
  async ({ event, step }: any) => {
    const { generationId, inputUrl, prompt } = event.data;

    await step.run("mark-processing", async () => {
      await prisma.generation.update({ where: { id: generationId }, data: { status: "processing" } });
    });

    const output: string[] = await step.run("run-replicate", async () => {
      return replicate.run(
        "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb" as `${string}/${string}`,
        { input: { music_input: inputUrl, prompt: prompt ?? "upbeat full band accompaniment", duration: 30 } }
      );
    });

    await step.run("save-stems", async () => {
      const stems = Array.isArray(output) ? output : [output];
      const instruments = ["mix", "drums", "bass", "guitar", "keys"];
      for (let i = 0; i < stems.length; i++) {
        await prisma.stem.create({
          data: { generationId, name: instruments[i] ?? `stem-${i}`, url: String(stems[i]) },
        });
      }
      await prisma.generation.update({ where: { id: generationId }, data: { status: "complete" } });
    });
  }
);
