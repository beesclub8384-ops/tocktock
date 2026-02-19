import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import html from "remark-html";

function getPostsDirectory(category: string): string {
  return path.join(process.cwd(), "posts", category);
}

const POST_EXTENSIONS = [".md", ".html"];

function isPostFile(fileName: string): boolean {
  return POST_EXTENSIONS.some((ext) => fileName.endsWith(ext));
}

function stripExtension(fileName: string): string {
  for (const ext of POST_EXTENSIONS) {
    if (fileName.endsWith(ext)) return fileName.slice(0, -ext.length);
  }
  return fileName;
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
    .filter(isPostFile)
    .map((fileName) => {
      const slug = stripExtension(fileName);
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
  return fileNames.filter(isPostFile).map(stripExtension);
}

function findPostFile(dir: string, slug: string): string | null {
  for (const ext of POST_EXTENSIONS) {
    const fullPath = path.join(dir, `${slug}${ext}`);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

export async function getPostData(
  category: string,
  slug: string
): Promise<Post> {
  const dir = getPostsDirectory(category);
  const fullPath = findPostFile(dir, slug);
  if (!fullPath) throw new Error(`Post not found: ${category}/${slug}`);

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const matterResult = matter(fileContents);

  let contentHtml: string;
  if (fullPath.endsWith(".html")) {
    contentHtml = matterResult.content;
  } else {
    const processedContent = await remark()
      .use(remarkGfm)
      .use(html)
      .process(matterResult.content);
    contentHtml = processedContent.toString();
  }

  return {
    slug,
    title: matterResult.data.title,
    date: matterResult.data.date,
    summary: matterResult.data.summary,
    contentHtml,
  };
}
