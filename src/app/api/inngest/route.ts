import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { generateStems } from "@/inngest/generate-stems";

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT } = serve({ client: inngest, functions: [generateStems] });
