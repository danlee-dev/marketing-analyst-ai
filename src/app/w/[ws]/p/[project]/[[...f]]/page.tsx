import { ProjectView } from "@/components/project/ProjectView";

// 프로젝트가 바뀌면 화면 상태(목록·선택)를 새로 시작
export default async function ProjectPage({ params }: PageProps<"/w/[ws]/p/[project]/[[...f]]">) {
  const { project } = await params;
  return <ProjectView key={project} />;
}
