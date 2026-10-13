import type { ClubCategory } from "@/lib/rules";

// Seed list for Admin > Clubs > "Import Sunway clubs". Names and Instagram handles
// come from Sunway's public Student LIFE and University pages; the admin should
// verify and complete the rest (Sunway lists 100+ clubs, only part is seeded here).
export interface SeedClub {
  name: string;
  category: ClubCategory;
  instagram?: string;
  note?: string;
}

export const SUNWAY_CLUBS: SeedClub[] = [
  // Student Leadership Bodies
  { name: "Sunway University Student Council (SUSC)", category: "Student Leadership Body", instagram: "sus_council" },
  { name: "Sunway College Student Council", category: "Student Leadership Body", instagram: "sccsunway" },
  { name: "Sunway Sports Council", category: "Student Leadership Body", instagram: "sunway.sportscouncil" },
  { name: "Echo Media", category: "Student Leadership Body", instagram: "sunwayechomedia" },
  { name: "Sunway Student Volunteers (SSV)", category: "Student Leadership Body", instagram: "ssv_shoeboxproject" },
  { name: "Sunway Student Ambassadors (SSA)", category: "Student Leadership Body", instagram: "sunwayssa" },
  { name: "Sunway International Student Ambassadors (SISA)", category: "Student Leadership Body", instagram: "sisa_sunway" },
  { name: "Sunway Global Friends Community (SGFC)", category: "Student Leadership Body", instagram: "sunwayglobalfriendscommunity" },
  { name: "Peer Support Volunteer (PCV)", category: "Student Leadership Body", instagram: "sunway_pcv" },
  // Clubs and societies
  { name: "Wushu Club", category: "Martial Art", instagram: "sunwayuni.wushuclub" },
  { name: "Sunway DealFlow Club", category: "Business", instagram: "sdfc.sunway" },
  { name: "Bouldering Club", category: "Sports", instagram: "sunwayboulderingclub" },
  { name: "Sunway Oceans Society", category: "Nature", instagram: "sos_sunwayoceansociety" },
  { name: "Institute of Civil Engineering Student Chapter", category: "Academic/Professional", instagram: "icesunway" },
  { name: "Sunway Myanmar Society", category: "Cultural", instagram: "sunway_myanmar_society" },
  { name: "Sunway Arabic & Middle Eastern Society", category: "Cultural", instagram: "samess_sunway" },
  { name: "Sunway Eco Club", category: "Nature", instagram: "sunway.eco" },
  { name: "Sunway Sudanese Society", category: "Cultural", instagram: "sss_sunway" },
  { name: "Sunway Bangladeshi Society", category: "Cultural", instagram: "sunwaybd" },
  { name: "Sunway Japanese Student Association", category: "Cultural", instagram: "jsas_sunway" },
  { name: "Sunway University Mauritian Society", category: "Cultural", instagram: "sums.sunway" },
  { name: "Sunway Seychelles Society", category: "Cultural", instagram: "sunwayseychelles" },
  { name: "Sunway African Cultural Association (SACA)", category: "Cultural", instagram: "sunwaysaca" },
  { name: "Sunway Pakistani Community", category: "Cultural", instagram: "sunway_pc" },
  { name: "Sunway Sri Lankan Society", category: "Cultural", instagram: "sunway_sri_lankan_society" },
  { name: "Sunway Maldivian Association", category: "Cultural", instagram: "sunway_sma" },
  { name: "Rubik's Cube Club", category: "General Interest", instagram: "sunway_rubikscube" },
  { name: "Sunway Pawprint Society", category: "Nature", instagram: "sunwaypawprint" },
  { name: "Sunway Photography Club", category: "Art & Music", instagram: "sunwayphotographyclub" },
  { name: "Sunway Film Society", category: "Art & Music", instagram: "sunwayfilmsociety" },
  { name: "Sunway Game Development Club", category: "General Interest", instagram: "sunwaygamedev" },
  { name: "IChemE Sunway Student Chapter", category: "Academic/Professional", instagram: "ichemeumsc" },
  { name: "IEM Sunway Student Section", category: "Academic/Professional", instagram: "iemsunway" },
  { name: "Rotaract Club of Sunway University", category: "Uniform/Affiliate" },
  { name: "TEDxSunway University", category: "Uniform/Affiliate" },
  { name: "Sunway LEO Club", category: "Uniform/Affiliate" },
  { name: "Amnesty Malaysia Sunway Club", category: "Uniform/Affiliate" },
  { name: "Sunway University Toastmasters Club", category: "Uniform/Affiliate" },
  { name: "Sunway Model United Nations (SUNMUN)", category: "Uniform/Affiliate" },
  { name: "Sunway Biological Society (SBIOS)", category: "Nature" },
  { name: "Sunway Sustainability Club (SSC)", category: "Nature" },
  { name: "Sunway Education Wildlife Club (SWC)", category: "Nature" },
  { name: "Sunway Christian Fellowship", category: "Religious", note: "Name taken from an event listing; admin to verify." },
  { name: "Sunway University Chinese Orchestra", category: "Art & Music", note: "Name taken from an event listing; admin to verify." },
  { name: "Team Sunway", category: "Sports", note: "Inter-varsity representation platform." },
];
