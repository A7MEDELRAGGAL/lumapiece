import { fileURLToPath } from 'node:url';

const categories = [
  'Animals', 'Birds', 'Cats', 'Dogs', 'Fish', 'Art', 'Classic Paintings', 'Abstract', 'Nature', 'Beaches', 'Flowers', 'Lakes', 'Landscapes', 'Sunsets', 'Waterfalls', 'Food', 'Holidays', 'Christmas', 'Halloween', 'Sports', 'Space', 'Technology', 'Transportation', 'Cars', 'Airplanes', 'Ships', 'Trains', 'Buildings', 'Castles', 'Houses', 'Bridges', 'Travel', 'People', 'Funny', 'Mystery', 'Other',
];
const tags = ['calm', 'colorful', 'family', 'seasonal', 'outdoors', 'architecture', 'challenging', 'editor-pick'];

const imageSeeds = [
  ['Golden Coast', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=88'],
  ['Forest Trail', 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=88'],
  ['Quiet Lake', 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=88'],
  ['City at Night', 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1200&q=88'],
  ['Lavender Fields', 'https://images.unsplash.com/photo-1499002238440-d264edd596ec?auto=format&fit=crop&w=1200&q=88'],
  ['Alpine Morning', 'https://images.unsplash.com/photo-1464278533981-50106e6176b1?auto=format&fit=crop&w=1200&q=88'],
  ['Coffee & Pages', 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=88'],
  ['Village Church', 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=88'],
];

export function buildSeedData() {
  const puzzles = Array.from({ length: 50 }, (_, index) => {
    const [title, imageUrl] = imageSeeds[index % imageSeeds.length];
    const number = index + 1;
    return {
      slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${number}`,
      title: `${title} ${number > imageSeeds.length ? `No. ${number}` : ''}`.trim(),
      description: 'A calm, original puzzle scene for a few quiet minutes of play.',
      imageUrl,
      thumbnailUrl: imageUrl,
      width: 1200,
      height: 800,
      difficulty: index % 5 === 0 ? 'HARD' : index % 3 === 0 ? 'MEDIUM' : 'EASY',
      piecePresets: [6, 12, 24, 48, 60, 100, 200, 300, 500],
      mystery: index === 1,
      challenging: index < 5,
      featured: index < 5,
      editorPick: index < 5,
      multiplayer: true,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    };
  });
  return { categories, tags, puzzles };
}

// The production Prisma adapter can call buildSeedData() from prisma/seed.ts.
// Keeping this module dependency-free makes it useful for local previews too.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const data = buildSeedData();
  console.log(JSON.stringify({ categories: data.categories.length, tags: data.tags.length, puzzles: data.puzzles.length }, null, 2));
}
