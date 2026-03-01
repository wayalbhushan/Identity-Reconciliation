import express, { Request, Response } from 'express';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const app = express(); 
const prisma = new PrismaClient();

// Security Middlewares 
app.use(helmet()); // Secure HTTP headers
app.use(express.json({ limit: '10kb' })); // Prevents Payload-based DDoS 

// Zod Validation Schema (Strict checking & sanitization)
const identifySchema = z.object({
    email: z.string().email().optional().nullable().transform(e => (e && e.trim() !== '') ? e.trim() : null),
    phoneNumber: z.union([z.string(), z.number()]).optional().nullable().transform(p => {
        if (p === null || p === undefined) return null;
        const str = String(p).trim();
        return str !== '' ? str : null;
    }),
}).refine(data => data.email !== null || data.phoneNumber !== null, {
    message: "At least one of email or phoneNumber must be provided.",
});

app.post('/identify', async (req: Request, res: Response) => {
    try {
        // 1. Validate payload
        const validationResult = identifySchema.safeParse(req.body);
        if (!validationResult.success) {
            return res.status(400).json({ error: "Bad Request", details: validationResult.error.errors });
        }

        const { email, phoneNumber } = validationResult.data;
        const orConditions = [];
        if (email) orConditions.push({ email });
        if (phoneNumber) orConditions.push({ phoneNumber });

        // 2. Fetch matches (Ignore soft-deleted entries)
        const matches = await prisma.contact.findMany({
            where: { OR: orConditions, deletedAt: null },
        });

        // Case 1: The New Identity
        if (matches.length === 0) {
            const newContact = await prisma.contact.create({
                data: { email, phoneNumber, linkPrecedence: 'primary' },
            });
            return res.status(200).json({
                contact: {
                    primaryContatctId: newContact.id, 
                    emails: newContact.email ? [newContact.email] : [],
                    phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
                    secondaryContactIds: [],
                }
            });
        }

        // 3. Obtain entire interconnected subgraph
        // A target's absolute root is its linkedId (if secondary) or its id (if primary)
        const rootIds = Array.from(new Set(matches.map(c => c.linkedId || c.id)));

        let clusterContacts = await prisma.contact.findMany({
            where: {
                OR: [{ id: { in: rootIds } }, { linkedId: { in: rootIds } }],
                deletedAt: null
            },
            orderBy: { createdAt: 'asc' }, // Order chronologically to correctly identify absolute root
        });

        // The oldest primary identity is designated as the absolute root
        let primaryContact = clusterContacts.find(c => c.linkPrecedence === 'primary');
        if (!primaryContact) {
            primaryContact = clusterContacts[0];
        }

        // Case 4: The Merger
        // Check if there are other subsequent primaries within this cluster that need collapsing
        const otherPrimaries = clusterContacts.filter(
            c => c.id !== primaryContact!.id && c.linkPrecedence === 'primary'
        );

        if (otherPrimaries.length > 0) {
            const otherPrimaryIds = otherPrimaries.map(c => c.id);

            // to ensure database consistency against race conditions
            await prisma.$transaction([
                prisma.contact.updateMany({
                    where: { id: { in: otherPrimaryIds } },
                    data: { linkPrecedence: 'secondary', linkedId: primaryContact.id, updatedAt: new Date() },
                }),
                prisma.contact.updateMany({
                    where: { linkedId: { in: otherPrimaryIds } },
                    data: { linkedId: primaryContact.id, updatedAt: new Date() },
                }),
            ]);

            // Update in-memory state so returning output reflects the latest tree representation
            clusterContacts = clusterContacts.map(c => {
                if (otherPrimaryIds.includes(c.id) || (c.linkedId && otherPrimaryIds.includes(c.linkedId))) {
                    return { ...c, linkPrecedence: 'secondary', linkedId: primaryContact!.id };
                }
                return c;
            });
        }

        // Case 3: The Extension
        const existingEmails = new Set(clusterContacts.map(c => c.email).filter(Boolean));
        const existingPhones = new Set(clusterContacts.map(c => c.phoneNumber).filter(Boolean));

        const hasNewEmail = email !== null && !existingEmails.has(email);
        const hasNewPhone = phoneNumber !== null && !existingPhones.has(phoneNumber);

        if (hasNewEmail || hasNewPhone) {
            const newSecondary = await prisma.contact.create({
                data: {
                    email,
                    phoneNumber,
                    linkedId: primaryContact.id,
                    linkPrecedence: 'secondary',
                },
            });
            clusterContacts.push(newSecondary);
        }

        // 4. Prepare Output Data Configuration
        // Primary contact email arrays always appear first
        const emails = Array.from(new Set([
            primaryContact.email,
            ...clusterContacts.map(c => c.email)
        ].filter(Boolean) as string[]));

        const phoneNumbers = Array.from(new Set([
            primaryContact.phoneNumber,
            ...clusterContacts.map(c => c.phoneNumber)
        ].filter(Boolean) as string[]));

        const secondaryContactIds = clusterContacts
            .filter(c => c.id !== primaryContact!.id && c.linkPrecedence === 'secondary')
            .map(c => c.id);

        return res.status(200).json({
            contact: {
                primaryContatctId: primaryContact.id, //documentation typo
                emails,
                phoneNumbers,
                secondaryContactIds,
            }
        });

    } catch (error) {
        console.error("Internal Server Error:", error);
        // Suppress internal system architectures from being exposed
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Bitespeed Identity Service listening on port ${PORT}`);
});
