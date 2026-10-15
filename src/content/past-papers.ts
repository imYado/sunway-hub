// Past paper directories, posted once by the seed script as anonymous, approved study posts.
// They only link to official pages; no papers are copied onto the site.
import type { PostLink } from "@/db/schema";

export interface DirectoryPost {
  title: string;
  description: string;
  subjects: string[];
  links: PostLink[];
}

const cambridge = (slug: string, label: string): PostLink => ({
  url: `https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-international-as-and-a-level-${slug}/past-papers/`,
  label,
});

const LIBRARY: PostLink = { url: "https://library.sunway.edu.my/pep9", label: "Sunway Library: Past Exam Papers guide" };

export const PAST_PAPER_DIRECTORIES: DirectoryPost[] = [
  {
    title: "Cambridge A-Level past papers: official links by subject",
    description:
      "Free past papers, mark schemes and examiner reports from Cambridge International, the board that sets Sunway's A-Level exams.\n\n" +
      "Open your subject and scroll to the past papers section. Cambridge only publishes a selection of recent exam series on its public site. " +
      "If your subject isn't listed here, use the first link to find it.",
    subjects: ["Past Papers", "Cambridge A-Level"],
    links: [
      {
        url: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/subjects/",
        label: "All Cambridge AS & A Level subjects",
      },
      cambridge("mathematics-9709", "Mathematics (9709)"),
      cambridge("mathematics-further-9231", "Further Mathematics (9231)"),
      cambridge("physics-9702", "Physics (9702)"),
      cambridge("chemistry-9701", "Chemistry (9701)"),
      cambridge("biology-9700", "Biology (9700)"),
      cambridge("economics-9708", "Economics (9708)"),
      cambridge("accounting-9706", "Accounting (9706)"),
      cambridge("business-9609", "Business (9609)"),
      cambridge("computer-science-9618", "Computer Science (9618)"),
      cambridge("law-9084", "Law (9084)"),
      cambridge("general-paper-as-level-only-8021", "General Paper (8021)"),
      {
        url: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-international-as-and-a-level-psychology-9990/",
        label: "Psychology (9990)",
      },
    ],
  },
  {
    title: "AUSMAT past ATAR exams: official WA links",
    description:
      "AUSMAT follows Western Australia's ATAR courses, so past exams and marking keys come from the School Curriculum and Standards " +
      "Authority (SCSA). Pick your subject on the SCSA page. No login needed.",
    subjects: ["Past Papers", "AUSMAT"],
    links: [{ url: "https://www.scsa.wa.edu.au/publications/past-atar-course-exams", label: "SCSA: Past ATAR course exams" }, LIBRARY],
  },
  {
    title: "ACCA past and specimen exams: official links",
    description:
      "ACCA publishes specimen exams, past exams and examiner reports for each paper. The Practice Platform lets you sit them in the real " +
      "computer-based exam format. It's free, but you sign in with your myACCA account.",
    subjects: ["Past Papers", "ACCA"],
    links: [
      { url: "https://www.accaglobal.com/gb/en/student/exam-support-resources.html", label: "ACCA: Study support resources" },
      {
        url: "https://www.accaglobal.com/gb/en/student/exam-support-resources/professional-exams-study-resources/cbe-platform-support.html",
        label: "ACCA Practice Platform (myACCA login)",
      },
    ],
  },
  {
    title: "Sunway Library past papers: CIMP, Diploma and more",
    description:
      "Sunway's library keeps a past papers guide for college programmes. The guide itself is public. The CIMP and Sunway Diploma Studies " +
      "papers are only for Sunway students, so those links ask you to sign in with your Sunway account.\n\n" +
      "The library doesn't hold papers for MUFY or the Victoria University programmes. Ask your lecturer or programme leader for those.",
    subjects: ["Past Papers", "CIMP", "Sunway Diploma Studies"],
    links: [
      LIBRARY,
      {
        url: "https://go.openathens.net/redirector/university.sunway.edu.my?url=https://libstor.sunway.edu.my/examdbase/cimp/cimpnew1.html",
        label: "CIMP past papers, 2017 onwards (Sunway login)",
      },
      {
        url: "https://go.openathens.net/redirector/university.sunway.edu.my?url=https://libstor.sunway.edu.my/examdbase/sds/SDSDipBusAdm.html",
        label: "Sunway Diploma Studies, 2019 to 2020 (Sunway login)",
      },
    ],
  },
];
