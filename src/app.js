import process from "node:process";
import {
	FromRadioSchema,
	ToRadioSchema,
} from "@buf/meshtastic_protobufs.bufbuild_es/meshtastic/mesh_pb.js";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

const meshtasticHost = process.env.MESHTASTIC_HOST;
if (!meshtasticHost) {
	throw new Error(`MESHTASTIC_HOST variable is not set!`);
}

async function init() {
	let wantConfigId = create(ToRadioSchema);
	wantConfigId.payloadVariant = {
		case: "wantConfigId",
		value: 1337, // this value is passed in configCompleteId message
	};

	let wantConfigIdPayload = toBinary(ToRadioSchema, wantConfigId);

	return fetch(`http://${meshtasticHost}/api/v1/toradio`, {
		headers: {
			accept: "application/x-protobuf",
			"content-type": "application/x-protobuf",
		},
		body: wantConfigIdPayload,
		method: "PUT",
	});
}

const MAX_RESPONSE_SIZE = 512;

await init();

let myNodeNumber = undefined;
const nodes = {};

function setMyNode(myNodeInfo) {
	myNodeNumber = myNodeInfo.myNodeNum;
	console.log("my node", myNodeNumber);
}

function addNodeInfo(nodeInfo) {
	if (nodeInfo.viaMqtt) {
		// we don't want nodes heard via mqtt!
		return;
	}

	const nodeNumber = nodeInfo.num;
	const lastHeardEpoch = nodeInfo.lastHeard;

	nodes[nodeNumber] = {
		nodeNumber: nodeNumber, // PK
		lastHeardEpoch: lastHeardEpoch,
		snr: nodeInfo.snr,
		userId: nodeInfo.user.id,
		userLongName: nodeInfo.user.longName,
		userShortName: nodeInfo.user.shortName,
		latitude: nodeInfo.position?.latitudeI,
		longitude: nodeInfo.position?.longitudeI,
		altitude: nodeInfo.position?.altitude,
	};
	console.log(nodes);
}

function processPacket(packet) {
	if (packet.viaMqtt) {
		// we don't care about messages passed via mqtt
		return;
	}

	const MAX_UINT32 = 4294967295;
	if (packet.to === MAX_UINT32) {
		return;
	}

	const { rxTime: receivedAtEpoch, from, to } = packet;

	const sender = nodes[from]?.userShortName ?? "unknown";
	const recipient = nodes[to]?.userShortName ?? "unknown";
	const receivedAt = new Date(receivedAtEpoch * 1000);

	console.log(
		`Packet received at: ${receivedAt.toISOString()} from: ${sender} (${from}) to: ${recipient} (${to})`,
	);
	console.log(JSON.stringify(packet));
}

function noOp() {}

/**
 * @param {Response} response
 */
async function processResponse(response) {
	const rawBytes = await response.arrayBuffer();
	if (rawBytes.byteLength > MAX_RESPONSE_SIZE) {
		throw new Error(
			`Response bigger than max package size: ${rawBytes.byteLength}`,
		);
	} else if (rawBytes.byteLength === 0) {
		return;
	}

	const bytes = new Uint8Array(rawBytes);

	try {
		/** @var {FromRadioSchema} decoded  */
		const decoded = fromBinary(FromRadioSchema, bytes);
		switch (decoded.payloadVariant.case) {
			case "myInfo":
				setMyNode(decoded.payloadVariant.value);
				break;
			case "nodeInfo":
				addNodeInfo(decoded.payloadVariant.value);
				break;
			case "packet":
				processPacket(decoded.payloadVariant.value);
				break;
			case "config":
			case "metadata":
			case "moduleConfig":
			case "fileInfo":
				noOp();
				break;
			default:
				console.log(JSON.stringify(decoded.payloadVariant));
		}
		// console.log(JSON.stringify(decoded));
	} catch (e) {
		console.error(`Failed to decode binary: ${e}`);
	}
}

async function fromRadio() {
	return fetch(`http://${meshtasticHost}/api/v1/fromradio?all=false`, {
		headers: {
			accept: "application/x-protobuf",
			Referer: "http://pi-klin-01.kliniska:8080/",
		},
	});
}

console.log(`Going to connect to: '${meshtasticHost}'`);

await init();

setInterval(async () => {
	const result = await fromRadio();
	await processResponse(result);
}, 250);

console.log();
