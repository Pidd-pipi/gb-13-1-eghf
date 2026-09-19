import type { MatchReason } from '@/types';

interface MatchSource {
  campus: string;
  courseCode: string;
  edition: string;
}

const normCourse = (v: string) => (v || '').trim().toUpperCase();
const normText = (v: string) => (v || '').trim();

/** 与后端 matching.service.buildMatchReason 保持一致的匹配原因计算（用于前端即时展示） */
export const buildReason = (request: MatchSource, book: MatchSource): MatchReason => {
  const campus = normText(request.campus) === normText(book.campus);
  const courseCode = normCourse(request.courseCode) === normCourse(book.courseCode);
  const edition = normText(request.edition) === normText(book.edition);
  const matched = campus && courseCode && edition;

  const parts: string[] = [];
  parts.push(campus ? `同校区（${book.campus}）` : `校区不一致（求购${request.campus} / 书籍${book.campus}）`);
  parts.push(
    courseCode
      ? `同课程代码（${book.courseCode}）`
      : `课程代码不一致（求购${request.courseCode} / 书籍${book.courseCode}）`,
  );
  parts.push(edition ? `同版次（${book.edition}）` : `版次不一致（求购${request.edition} / 书籍${book.edition}）`);

  return {
    matched,
    campus,
    courseCode,
    edition,
    summary: matched ? `满足教材同版匹配：${parts.join('、')}` : `不满足同版匹配：${parts.join('、')}`,
  };
};
