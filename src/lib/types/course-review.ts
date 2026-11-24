export type ReviewLesson = {
  id: string;
  title: string;
  content: string;
  order: number;
};

export type ReviewSubject = {
  id: string;
  name: string;
  order: number;
  lessons: ReviewLesson[];
};

export type ReviewCourse = {
  id: string;
  contest: string;
  profession: string;
  title: string;
  description: string;
  editalUrl: string | null;
  createdAt: string;
  subjects: ReviewSubject[];
};
