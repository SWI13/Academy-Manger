/**
 * Choice lists, with their labels.
 *
 * GENERATED FILE - do not edit.
 * Regenerate with `python manage.py export_choices` in backend/.
 *
 * The OpenAPI schema types the accepted *values*; these carry the labels that
 * go beside them. A dropdown built from the enum alone would offer "16" with
 * no way to know that is Alger.
 */

export type Choice = { value: string; label: string };

export const WILAYAS: Choice[] = [
  { value: "01", label: "Adrar" },
  { value: "02", label: "Chlef" },
  { value: "03", label: "Laghouat" },
  { value: "04", label: "Oum El Bouaghi" },
  { value: "05", label: "Batna" },
  { value: "06", label: "Béjaïa" },
  { value: "07", label: "Biskra" },
  { value: "08", label: "Béchar" },
  { value: "09", label: "Blida" },
  { value: "10", label: "Bouira" },
  { value: "11", label: "Tamanrasset" },
  { value: "12", label: "Tébessa" },
  { value: "13", label: "Tlemcen" },
  { value: "14", label: "Tiaret" },
  { value: "15", label: "Tizi Ouzou" },
  { value: "16", label: "Alger" },
  { value: "17", label: "Djelfa" },
  { value: "18", label: "Jijel" },
  { value: "19", label: "Sétif" },
  { value: "20", label: "Saïda" },
  { value: "21", label: "Skikda" },
  { value: "22", label: "Sidi Bel Abbès" },
  { value: "23", label: "Annaba" },
  { value: "24", label: "Guelma" },
  { value: "25", label: "Constantine" },
  { value: "26", label: "Médéa" },
  { value: "27", label: "Mostaganem" },
  { value: "28", label: "M'Sila" },
  { value: "29", label: "Mascara" },
  { value: "30", label: "Ouargla" },
  { value: "31", label: "Oran" },
  { value: "32", label: "El Bayadh" },
  { value: "33", label: "Illizi" },
  { value: "34", label: "Bordj Bou Arréridj" },
  { value: "35", label: "Boumerdès" },
  { value: "36", label: "El Tarf" },
  { value: "37", label: "Tindouf" },
  { value: "38", label: "Tissemsilt" },
  { value: "39", label: "El Oued" },
  { value: "40", label: "Khenchela" },
  { value: "41", label: "Souk Ahras" },
  { value: "42", label: "Tipaza" },
  { value: "43", label: "Mila" },
  { value: "44", label: "Aïn Defla" },
  { value: "45", label: "Naâma" },
  { value: "46", label: "Aïn Témouchent" },
  { value: "47", label: "Ghardaïa" },
  { value: "48", label: "Relizane" },
  { value: "49", label: "Timimoun" },
  { value: "50", label: "Bordj Badji Mokhtar" },
  { value: "51", label: "Ouled Djellal" },
  { value: "52", label: "Béni Abbès" },
  { value: "53", label: "In Salah" },
  { value: "54", label: "In Guezzam" },
  { value: "55", label: "Touggourt" },
  { value: "56", label: "Djanet" },
  { value: "57", label: "El M'Ghair" },
  { value: "58", label: "El Meniaa" },
];

export const PRIOR_LEVELS: Choice[] = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "ELEMENTARY", label: "Elementary" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "UPPER_INTERMEDIATE", label: "Upper intermediate" },
  { value: "ADVANCED", label: "Advanced" },
];

export const PAYMENT_METHODS: Choice[] = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CCP", label: "CCP" },
  { value: "CARD", label: "Card" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
];

export const COURSE_STATUSES: Choice[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ARCHIVED", label: "Archived" },
];

export const ENROLLMENT_STATUSES: Choice[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "DROPPED", label: "Dropped" },
];

export const ASSIGNMENT_ROLES: Choice[] = [
  { value: "LEAD", label: "Lead" },
  { value: "ASSISTANT", label: "Assistant" },
];
