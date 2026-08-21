import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GalleryStatus, PrismaClient } from '@prisma/client';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(scriptDirectory, '..');
const assetDirectory = path.join(apiRoot, 'assets', 'gallery');
const uploadDirectory = path.join(apiRoot, 'uploads', 'gallery');
const manifestPath = path.join(assetDirectory, 'manifest.json');
const dryRun = process.argv.includes('--dry-run');

function resolvePublicBaseUrl() {
  return `${
    process.env.PUBLIC_BASE_URL ||
    process.env.API_BASE_URL ||
    `http://127.0.0.1:${process.env.PORT || 3100}`
  }`.replace(/\/+$/, '');
}

function resolveRuntimeFilename(filename) {
  return `figma-${path.basename(filename)}`;
}

async function loadManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.galleryItems) || !manifest.galleryItems.length) {
    throw new Error('Gallery seed manifest has no galleryItems');
  }
  return manifest;
}

async function verifyImages(manifest) {
  const exportedFiles = [...new Set((manifest.assets || []).map((asset) => asset.filename))];
  const referencedFiles = [
    ...new Set(manifest.galleryItems.flatMap((item) => item.imageFiles || []))
  ];
  const missingManifestFile = referencedFiles.find((filename) => !exportedFiles.includes(filename));
  if (missingManifestFile) {
    throw new Error(`Seeded image is missing from the asset manifest: ${missingManifestFile}`);
  }

  for (const filename of exportedFiles) {
    const normalizedFilename = path.basename(filename);
    if (normalizedFilename !== filename) {
      throw new Error(`Invalid gallery asset filename: ${filename}`);
    }

    const bytes = await readFile(path.join(assetDirectory, normalizedFilename));
    const expectedHash = path.basename(normalizedFilename, path.extname(normalizedFilename));
    const actualHash = createHash('sha1').update(bytes).digest('hex');
    if (actualHash !== expectedHash) {
      throw new Error(`Gallery asset hash mismatch: ${normalizedFilename}`);
    }
  }

  return { exportedFiles, referencedFiles };
}

async function stageImages(galleryItems) {
  const imageFiles = [...new Set(galleryItems.flatMap((item) => item.imageFiles || []))];
  await mkdir(uploadDirectory, { recursive: true });

  for (const filename of imageFiles) {
    await copyFile(
      path.join(assetDirectory, path.basename(filename)),
      path.join(uploadDirectory, resolveRuntimeFilename(filename))
    );
  }
}

function buildGalleryData(item, publicBaseUrl) {
  const imageUrls = item.imageFiles.map(
    (filename) =>
      `${publicBaseUrl}/api/v1/staff/uploads/images/${resolveRuntimeFilename(filename)}`
  );

  return {
    title: item.title,
    imageUrl: imageUrls[0],
    imageUrlsJson: JSON.stringify(imageUrls),
    description: item.description,
    tagsJson: JSON.stringify(item.tags),
    publishedAt: new Date(item.publishedAt),
    createdByOpenId: null,
    sortOrder: item.sortOrder,
    status: GalleryStatus.ACTIVE
  };
}

async function main() {
  const manifest = await loadManifest();
  const publicBaseUrl = resolvePublicBaseUrl();
  const { exportedFiles, referencedFiles } = await verifyImages(manifest);

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          publicBaseUrl,
          assetDirectory,
          exportedFiles,
          referencedFiles,
          items: manifest.galleryItems.map((item) => ({
            id: item.id,
            title: item.title,
            imageCount: item.imageFiles.length
          }))
        },
        null,
        2
      )
    );
    return;
  }

  await stageImages(manifest.galleryItems);

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$transaction(
      manifest.galleryItems.map((item) => {
        const data = buildGalleryData(item, publicBaseUrl);
        return prisma.galleryItem.upsert({
          where: { id: item.id },
          create: { id: item.id, ...data },
          update: data
        });
      })
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: false,
          publicBaseUrl,
          items: rows.map((row, index) => ({
            id: row.id,
            title: row.title,
            imageCount: manifest.galleryItems[index].imageFiles.length
          }))
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
