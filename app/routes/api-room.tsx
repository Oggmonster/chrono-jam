import type { Route } from "./+types/api-room";
import {
  applyRoomLobbySetup,
  getRoomState,
  removeParticipant,
  replaceRoomState,
  updateRoomGameSongCount,
  updateRoomPlaylistIds,
  upsertPreloadReadiness,
  upsertGuessSubmission,
  upsertTimelineSubmission,
  upsertParticipant,
} from "~/lib/room-store.server";

type RoomCommand =
  | { type: "replace_state"; state: unknown }
  | { type: "upsert_participant"; participant: { id: string; name: string } }
  | { type: "remove_participant"; participantId: string }
  | {
      type: "submit_guess";
      submission: { playerId: string; roundId: string; trackId: string; artistId: string };
    }
  | {
      type: "submit_timeline";
      submission: { playerId: string; roundId: string; insertIndex: number };
    }
  | {
      type: "update_preload";
      readiness: {
        playerId: string;
        gamePackLoaded: boolean;
        autocompleteLoaded: boolean;
        gamePackHash: string;
      };
    }
  | {
      type: "update_playlist_ids";
      playlistIds: string[];
    }
  | {
      type: "update_game_song_count";
      songCount: number;
    }
  | {
      type: "apply_lobby_setup";
      setup: {
        playlistIds: string[];
        songCount: number;
      };
    };

export async function loader({ params }: Route.LoaderArgs) {
  const roomId = params.roomId;
  if (!roomId) {
    return new Response("Missing room id", { status: 400 });
  }

  return Response.json(getRoomState(roomId));
}

export async function action({ request, params }: Route.ActionArgs) {
  const roomId = params.roomId;
  if (!roomId) {
    return new Response("Missing room id", { status: 400 });
  }

  let command: RoomCommand;
  try {
    command = (await request.json()) as RoomCommand;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (!command || typeof command !== "object" || typeof command.type !== "string") {
    return new Response("Invalid command", { status: 400 });
  }

  switch (command.type) {
    case "replace_state":
      return Response.json(replaceRoomState(roomId, command.state));
    case "upsert_participant": {
      const participant = command.participant;
      if (!participant || typeof participant.id !== "string" || typeof participant.name !== "string") {
        return new Response("Invalid participant payload", { status: 400 });
      }
      return Response.json(upsertParticipant(roomId, participant));
    }
    case "remove_participant":
      if (!command.participantId || typeof command.participantId !== "string") {
        return new Response("Invalid participant id", { status: 400 });
      }
      return Response.json(removeParticipant(roomId, command.participantId));
    case "submit_guess": {
      const submission = command.submission;
      if (
        !submission ||
        typeof submission.playerId !== "string" ||
        typeof submission.roundId !== "string" ||
        typeof submission.trackId !== "string" ||
        typeof submission.artistId !== "string"
      ) {
        return new Response("Invalid guess submission payload", { status: 400 });
      }
      return Response.json(upsertGuessSubmission(roomId, submission));
    }
    case "submit_timeline": {
      const submission = command.submission;
      if (
        !submission ||
        typeof submission.playerId !== "string" ||
        typeof submission.roundId !== "string" ||
        typeof submission.insertIndex !== "number"
      ) {
        return new Response("Invalid timeline submission payload", { status: 400 });
      }
      return Response.json(upsertTimelineSubmission(roomId, submission));
    }
    case "update_preload": {
      const readiness = command.readiness;
      if (
        !readiness ||
        typeof readiness.playerId !== "string" ||
        typeof readiness.gamePackLoaded !== "boolean" ||
        typeof readiness.autocompleteLoaded !== "boolean" ||
        typeof readiness.gamePackHash !== "string"
      ) {
        return new Response("Invalid preload readiness payload", { status: 400 });
      }
      return Response.json(upsertPreloadReadiness(roomId, readiness));
    }
    case "update_playlist_ids": {
      if (!Array.isArray(command.playlistIds)) {
        return new Response("Invalid playlist ids payload", { status: 400 });
      }
      return Response.json(updateRoomPlaylistIds(roomId, command.playlistIds));
    }
    case "update_game_song_count": {
      if (typeof command.songCount !== "number") {
        return new Response("Invalid game song count payload", { status: 400 });
      }
      return Response.json(updateRoomGameSongCount(roomId, command.songCount));
    }
    case "apply_lobby_setup": {
      const setup = command.setup;
      if (
        !setup ||
        !Array.isArray(setup.playlistIds) ||
        typeof setup.songCount !== "number"
      ) {
        return new Response("Invalid lobby setup payload", { status: 400 });
      }
      return Response.json(applyRoomLobbySetup(roomId, setup));
    }
    default:
      return new Response("Unsupported command", { status: 400 });
  }
}
