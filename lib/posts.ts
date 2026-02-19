import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import html from "remark-html";

function getPostsDirectory(category: string): string {
  return path.join(process.cwd(), "posts", category);
}

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  summary: string;
}

export interface Post extends PostMeta {
  contentHtml: string;
}

export function getSortedPostsData(category: string): PostMeta[] {
  const dir = getPostsDirectory(category);
  if (!fs.existsSync(dir)) return [];
  const fileNames = fs.readdirSync(dir);
  const allPostsData: PostMeta[] = fileNames
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => {
      const slug = fileName.replace(/\.md$/, "");
      const fullPath = path.join(dir, fileName);
      const fileContents = fs.readFileSync(fullPath, "utf8");
      const matterResult = matter(fileContents);

      return {
        slug,
        title: matterResult.data.title,
        date: matterResult.data.date,
        summary: matterResult.data.summary,
      };
    });

  return allPostsData.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getAllPostSlugs(category: string): string[] {
  const dir = getPostsDirectory(category);
  if (!fs.existsSync(dir)) return [];
  const fileNames = fs.readdirSync(dir);
  return fileNames
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => fileName.replace(/\.md$/, ""));
}

export async function getPostData(
  category: string,
  slug: string
): Promise<Post> {
  const fullPath = path.join(getPostsDirectory(category), `${slug}.md`);
  const fileContents = fs.readFileSync(fullPath, "utf8");
  const matterResult = matter(fileContents);

  const processedContent = await remark()
    .use(remarkGfm)
    .use(html)
    .process(matterResult.content);
  const contentHtml = processedContent.toString();

  return {
    slug,
    title: matterResult.data.title,
    date: matterResult.data.date,
    summary: matterResult.data.summary,
    contentHtml,
  };
}
