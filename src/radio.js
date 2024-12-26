export class Radio {
	#meshtasticHost;
	#useTls = false;

	/**
	 * @param {string} meshtasticHost
	 * @param {undefined|boolean} useTls
	 */
	constructor(meshtasticHost, useTls = undefined) {
		this.#meshtasticHost = meshtasticHost;
		if (useTls) {
			this.#useTls = useTls;
		}
	}

	/**
	 * @param {string} path
	 * @returns {string}
	 */
	#url(path) {
		const meshtasticHost = this.#meshtasticHost;
		const protocol = this.#useTls ? "https" : "http";

		return `${protocol}://${meshtasticHost}/${path}`;
	}

	async toRadio(payload) {
		return fetch(this.#url("api/v1/toradio"), {
			headers: {
				accept: "application/x-protobuf",
				"content-type": "application/x-protobuf",
			},
			body: payload,
			method: "PUT",
		});
	}

	async fromRadio() {
		return fetch(this.#url("api/v1/fromradio?all=false"), {
			headers: {
				accept: "application/x-protobuf",
				"content-type": "application/x-protobuf",
			},
		});
	}
}
