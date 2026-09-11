import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getDriveClient } from "@/lib/googleDrive";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session || !session.accessToken) {
      return new NextResponse("Não autorizado", { status: 401 });
    }

    const resolvedParams = await params;
    const { id } = resolvedParams;
    
    if (!id) {
      return new NextResponse("ID não fornecido", { status: 400 });
    }

    const drive = getDriveClient(session.accessToken);
    
    const fileMeta = await drive.files.get({
      fileId: id,
      fields: "mimeType, size, name",
    });

    const res = await drive.files.get(
      { fileId: id, alt: "media" },
      { responseType: "stream" }
    );

    const stream = res.data as any;

    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        stream.on("end", () => controller.close());
        stream.on("error", (err: any) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      }
    });

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": fileMeta.data.mimeType || "audio/mpeg",
        "Content-Disposition": `inline; filename="${encodeURIComponent(fileMeta.data.name || 'audio')}"`,
        "Accept-Ranges": "bytes",
      },
    });

  } catch (error: any) {
    console.error("Erro no stream:", error);
    return new NextResponse(error.message, { status: 500 });
  }
}
