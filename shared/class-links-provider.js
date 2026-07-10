// Today's implementation: static JSON in the repo.
// Swap the body of this function for a Drive-backed read (same pattern as
// the Music app's meaning.txt/notes.txt) later — call sites never change,
// only this function's insides, as long as it keeps returning
// [{ label, icon, url }, ...].
async function getClassLinks() {
  const res = await fetch('shared/class-links.json');
  if (!res.ok) return [];
  return res.json();
}

export { getClassLinks };
