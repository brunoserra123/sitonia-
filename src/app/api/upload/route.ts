import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getDriveClient, ensureAppFolder } from "@/lib/googleDrive";
import { Readable } from "stream";

function bufferToStream(buffer: Buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

export async function POST(req: Request) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session || !session.accessToken) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const drive = getDriveClient(session.accessToken);
    const folderId = await ensureAppFolder(drive);

    const fileMetadata = {
      name: file.name,
      parents: [folderId],
    };

    const media = {
      mimeType: file.type || "audio/mpeg",
      body: bufferToStream(buffer),
    };

    const uploadRes = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name",
    });

    return NextResponse.json({ 
      success: true, 
      fileId: uploadRes.data.id,
      fileName: uploadRes.data.name
    });

  } catch (error: any) {
    console.error("Erro no upload manual:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
