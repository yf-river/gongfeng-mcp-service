import { z } from "zod";
import { DEFAULT_PER_PAGE, MAX_PER_PAGE } from "../constants.js";

export const ResponseFormatSchema = z.enum(["json", "markdown"]).default("markdown");

export const ProjectIdSchema = z.union([z.string().min(1), z.number().int().positive()]).describe(
  "Gongfeng project numeric ID or URL path such as group/subgroup/repo. Paths are URL encoded automatically.",
);

export const PaginationSchema = {
  page: z.number().int().min(1).default(1).describe("Page number, starting at 1."),
  per_page: z.number().int().min(1).max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE).describe("Items per page, max 100."),
  response_format: ResponseFormatSchema.describe("Use markdown for reading or json for structured processing."),
};

export const ConfirmTargetSchema = z
  .string()
  .min(1)
  .describe("Required for destructive actions. Must exactly match the target name or ID described by the tool.");

export const BranchNameSchema = z.string().min(1).max(255).describe("Branch name.");
export const TagNameSchema = z.string().min(1).max(255).describe("Tag name.");
export const CommitMessageSchema = z.string().min(1).max(5000).describe("Commit message.");

export const ReviewerIdsSchema = z
  .array(z.union([z.string().min(1), z.number().int().positive()]))
  .min(1)
  .max(100)
  .describe("Reviewer user IDs or usernames accepted by the Gongfeng API.");

export type ZodObjectAny = z.ZodObject<Record<string, z.ZodType>>;
