/*
  Warnings:

  - A unique constraint covering the columns `[creditId]` on the table `CreditRetireRequest` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "CreditRetireRequest_creditId_key" ON "public"."CreditRetireRequest"("creditId");
