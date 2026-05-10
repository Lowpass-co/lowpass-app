/* ============================================
   LOWPASS — toTitleCase (Sprint 9 §7.3)

   Display-time name capitalisation. Use at every render point
   that surfaces a stored name string (profiles.name,
   persons.full_name, personnel.name, etc.). Don't mutate
   stored data.

   Rules:
     - Empty / null / undefined → empty string.
     - Words ≤3 chars that are entirely uppercase letters are
       preserved (BH, NYC, USA, DJ, MC).
     - Words with internal capitals are preserved verbatim
       (O'Brien, McDonald, MacKenzie, JoAnne).
     - Anything else: capitalise first letter, lowercase rest.
       "ADAM ROWLEY" → "Adam Rowley". "joe manager" → "Joe
       Manager". "JOHN" → "John".
   ============================================ */

export function toTitleCase(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return word;
      // Preserve all-caps short acronyms (BH, NYC, USA, DJ).
      if (
        word.length <= 3 &&
        word === word.toUpperCase() &&
        /^[A-Z]+$/.test(word)
      ) {
        return word;
      }
      // Preserve words with internal capitals (O'Brien, McDonald,
      // MacKenzie, JoAnne).
      if (/[a-z][A-Z]/.test(word) || /^[A-Z][a-z]+'[A-Z]/.test(word)) {
        return word;
      }
      // Standard: capitalize first letter, lowercase rest.
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}
