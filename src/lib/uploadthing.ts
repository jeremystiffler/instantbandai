import { createUploadthing, type FileRouter } from "uploadthing/next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const f = createUploadthing();

export const ourFileRouter = {
  audioUploader: f({ audio: { maxFileSize: "256MB", maxFileCount: 1 } })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user?.email) throw new Error("Unauthorized");
      return { email: session.user.email };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.url, key: file.key, email: metadata.email };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
