-- CreateEnum
CREATE TYPE "StatutRapport" AS ENUM ('BROUILLON', 'ENVOYE');

-- CreateTable
CREATE TABLE "RapportJournalier" (
    "id" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "jour" DATE NOT NULL,
    "appels" INTEGER NOT NULL DEFAULT 0,
    "visites" INTEGER NOT NULL DEFAULT 0,
    "rendezVous" INTEGER NOT NULL DEFAULT 0,
    "nouveauxProspects" INTEGER NOT NULL DEFAULT 0,
    "devisRemis" INTEGER NOT NULL DEFAULT 0,
    "contratsSignes" INTEGER NOT NULL DEFAULT 0,
    "primesSouscrites" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "encaissements" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "faitsMarquants" TEXT,
    "difficultes" TEXT,
    "programmeLendemain" TEXT,
    "statut" "StatutRapport" NOT NULL DEFAULT 'BROUILLON',
    "envoyeLe" TIMESTAMP(3),
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RapportJournalier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RapportJournalier_jour_idx" ON "RapportJournalier"("jour");

-- CreateIndex
CREATE UNIQUE INDEX "RapportJournalier_auteurId_jour_key" ON "RapportJournalier"("auteurId", "jour");

-- AddForeignKey
ALTER TABLE "RapportJournalier" ADD CONSTRAINT "RapportJournalier_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

