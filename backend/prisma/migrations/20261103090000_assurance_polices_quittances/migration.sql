-- CreateEnum
CREATE TYPE "TypePersonne" AS ENUM ('PARTICULIER', 'ENTREPRISE');

-- CreateEnum
CREATE TYPE "StatutFiche" AS ENUM ('A_CONTACTER', 'CONTACTE', 'RENDEZ_VOUS', 'DEVIS_REMIS', 'EN_NEGOCIATION', 'CLIENT', 'PERDU', 'SANS_SUITE');

-- CreateEnum
CREATE TYPE "BrancheAssurance" AS ENUM ('AUTO', 'SANTE', 'PREVOYANCE', 'IARD', 'VIE', 'EPARGNE', 'VOYAGE');

-- CreateEnum
CREATE TYPE "TypeAffaire" AS ENUM ('NOUVELLE', 'RENOUVELLEMENT', 'REMPLACEMENT');

-- CreateEnum
CREATE TYPE "Fractionnement" AS ENUM ('ANNUEL', 'SEMESTRIEL', 'TRIMESTRIEL', 'MENSUEL');

-- CreateEnum
CREATE TYPE "StatutPolice" AS ENUM ('EN_ATTENTE', 'EN_COURS', 'SUSPENDU', 'RESILIE', 'EXPIRE');

-- CreateEnum
CREATE TYPE "StatutQuittance" AS ENUM ('A_ENCAISSER', 'ENCAISSEE', 'IMPAYEE', 'ANNULEE');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "statut" "StatutFiche" NOT NULL DEFAULT 'A_CONTACTER',
ADD COLUMN     "typePersonne" "TypePersonne" NOT NULL DEFAULT 'PARTICULIER';

-- CreateTable
CREATE TABLE "Compagnie" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "interlocuteur" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Compagnie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaremeCommission" (
    "id" TEXT NOT NULL,
    "compagnieId" TEXT NOT NULL,
    "branche" "BrancheAssurance" NOT NULL,
    "typeAffaire" "TypeAffaire" NOT NULL,
    "tauxPct" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "BaremeCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Police" (
    "id" TEXT NOT NULL,
    "numeroPolice" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "compagnieId" TEXT NOT NULL,
    "apporteurId" TEXT,
    "branche" "BrancheAssurance" NOT NULL,
    "produit" TEXT NOT NULL,
    "typeAffaire" "TypeAffaire" NOT NULL DEFAULT 'NOUVELLE',
    "dateEffet" DATE NOT NULL,
    "dateEcheance" DATE NOT NULL,
    "taciteReconduction" BOOLEAN NOT NULL DEFAULT true,
    "primeAnnuelle" DECIMAL(18,2) NOT NULL,
    "fractionnement" "Fractionnement" NOT NULL DEFAULT 'ANNUEL',
    "tauxCommissionPct" DECIMAL(5,2),
    "statut" "StatutPolice" NOT NULL DEFAULT 'EN_COURS',
    "dateResiliation" DATE,
    "motifResiliation" TEXT,
    "policePrecedenteId" TEXT,
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Police_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quittance" (
    "id" TEXT NOT NULL,
    "policeId" TEXT NOT NULL,
    "periodeDebut" DATE NOT NULL,
    "periodeFin" DATE NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "dateEcheance" DATE NOT NULL,
    "statut" "StatutQuittance" NOT NULL DEFAULT 'A_ENCAISSER',
    "dateEncaissement" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quittance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Compagnie_nom_key" ON "Compagnie"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "BaremeCommission_compagnieId_branche_typeAffaire_key" ON "BaremeCommission"("compagnieId", "branche", "typeAffaire");

-- CreateIndex
CREATE UNIQUE INDEX "Police_policePrecedenteId_key" ON "Police"("policePrecedenteId");

-- CreateIndex
CREATE INDEX "Police_apporteurId_idx" ON "Police"("apporteurId");

-- CreateIndex
CREATE INDEX "Police_clientId_idx" ON "Police"("clientId");

-- CreateIndex
CREATE INDEX "Police_dateEffet_idx" ON "Police"("dateEffet");

-- CreateIndex
CREATE INDEX "Police_dateEcheance_idx" ON "Police"("dateEcheance");

-- CreateIndex
CREATE INDEX "Police_estDemo_idx" ON "Police"("estDemo");

-- CreateIndex
CREATE UNIQUE INDEX "Police_compagnieId_numeroPolice_key" ON "Police"("compagnieId", "numeroPolice");

-- CreateIndex
CREATE INDEX "Quittance_policeId_idx" ON "Quittance"("policeId");

-- CreateIndex
CREATE INDEX "Quittance_statut_idx" ON "Quittance"("statut");

-- CreateIndex
CREATE INDEX "Quittance_dateEcheance_idx" ON "Quittance"("dateEcheance");

-- AddForeignKey
ALTER TABLE "BaremeCommission" ADD CONSTRAINT "BaremeCommission_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "Compagnie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Police" ADD CONSTRAINT "Police_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Police" ADD CONSTRAINT "Police_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "Compagnie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Police" ADD CONSTRAINT "Police_apporteurId_fkey" FOREIGN KEY ("apporteurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Police" ADD CONSTRAINT "Police_policePrecedenteId_fkey" FOREIGN KEY ("policePrecedenteId") REFERENCES "Police"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quittance" ADD CONSTRAINT "Quittance_policeId_fkey" FOREIGN KEY ("policeId") REFERENCES "Police"("id") ON DELETE CASCADE ON UPDATE CASCADE;

