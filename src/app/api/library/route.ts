import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getDriveClient, ensureAppFolder } from "@/lib/googleDrive";

export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);
    
    if (!session || !session.accessToken) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const drive = getDriveClient(session.accessToken);
    const folderId = await ensureAppFolder(drive);

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false and (mimeType contains 'audio/' or mimeType contains 'video/')`,
      fields: "files(id, name, mimeType, size)",
      spaces: "drive",
    });

    return NextResponse.json({ files: res.data.files || [] });
  } catch (error: any) {
    console.error("Erro ao listar biblioteca:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
