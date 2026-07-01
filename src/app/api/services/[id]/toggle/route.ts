import { NextRequest, NextResponse } from "next/server";
import { ServiceService } from "@/lib/services/service.service";
import { bodyErrorResponse, readOptionalJsonBody, RequestBodyError } from "@/lib/request-guards";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readOptionalJsonBody<{ durationMinutes?: number | null }>(request, {});
    const { durationMinutes } = body;

    const updatedService = await ServiceService.toggleService(id, undefined, durationMinutes);

    if (!updatedService) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    return NextResponse.json(updatedService);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return bodyErrorResponse(error);
    }

    console.error("Toggle service error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
