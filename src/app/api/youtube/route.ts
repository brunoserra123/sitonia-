import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getDriveClient, ensureAppFolder } from "@/lib/googleDrive";
import youtubedl from "youtube-dl-exec";
import fs from "fs";
import path from "path";
import os from "os";

export async function POST(req: Request) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session || !session.accessToken) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "URL do YouTube é obrigatória" }, { status: 400 });
    }

    // 1. Obter informações do vídeo
    const info = await youtubedl(url, {
      dumpJson: true,
      noWarnings: true,
      callHome: false,
      noCheckCertificate: true,
    }) as any;

    const videoTitle = info.title || "Audio_YouTube";
    const safeTitle = videoTitle.replace(/[^a-zA-Z0-9 ]/g, "");
    
    // 2. Baixar o áudio em formato M4A (AAC) - Melhor qualidade que MP3 ocupando muito menos espaço
    const tempFilePath = path.join(os.tmpdir(), `${safeTitle}.m4a`);
    
    await youtubedl(url, {
      extractAudio: true,
      audioFormat: "m4a",
      audioQuality: 0, // Qualidade Máxima VBR
      output: tempFilePath,
      noWarnings: true,
      callHome: false,
      noCheckCertificate: true,
    });

    // 3. Fazer Upload para o Google Drive
    const drive = getDriveClient(session.accessToken);
    const folderId = await ensureAppFolder(drive);

    const fileMetadata = {
      name: `${safeTitle}.m4a`,
      parents: [folderId],
    };

    const media = {
      mimeType: "audio/mp4",
      body: fs.createReadStream(tempFilePath),
    };

    const uploadRes = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name",
    });

    // 4. Limpar o arquivo temporário
    fs.unlinkSync(tempFilePath);

    return NextResponse.json({ 
      success: true, 
      fileId: uploadRes.data.id,
      fileName: uploadRes.data.name
    });

  } catch (error: any) {
    console.error("Erro no download do YouTube:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
