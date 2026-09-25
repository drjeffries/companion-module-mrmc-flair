/** Minimal OSC 1.0 message encoder - only the argument types Flair's OSC input uses. */

export type OscArg =
	| { type: 'i'; value: number }
	| { type: 'f'; value: number }
	| { type: 's'; value: string }
	| { type: 'b'; value: boolean }

function pad4(buf: Buffer): Buffer {
	const padding = 4 - (buf.length % 4)
	return Buffer.concat([buf, Buffer.alloc(padding)])
}

/** OSC strings are NUL-terminated and padded with NULs to a multiple of 4 bytes. */
function oscString(value: string): Buffer {
	return pad4(Buffer.from(value, 'utf8'))
}

export function encodeOscMessage(address: string, args: OscArg[] = []): Buffer {
	// OSC booleans carry no data bytes: the type tag itself ('T' / 'F') is the value.
	const typeTags = ',' + args.map((a) => (a.type === 'b' ? (a.value ? 'T' : 'F') : a.type)).join('')
	const parts: Buffer[] = [oscString(address), oscString(typeTags)]

	for (const arg of args) {
		switch (arg.type) {
			case 'i': {
				const b = Buffer.alloc(4)
				b.writeInt32BE(Math.trunc(arg.value))
				parts.push(b)
				break
			}
			case 'f': {
				const b = Buffer.alloc(4)
				b.writeFloatBE(arg.value)
				parts.push(b)
				break
			}
			case 's':
				parts.push(oscString(arg.value))
				break
			case 'b':
				break
		}
	}
	return Buffer.concat(parts)
}

export type OscValue = number | string | boolean

export interface OscMessage {
	address: string
	args: OscValue[]
}

function readOscString(buf: Buffer, offset: number): [string, number] {
	let end = buf.indexOf(0, offset)
	if (end === -1) end = buf.length
	const value = buf.toString('utf8', offset, end)
	// Strings are NUL-terminated and padded to a 4-byte boundary.
	return [value, offset + Math.ceil((end - offset + 1) / 4) * 4]
}

/** Decodes an OSC packet (single message, or a bundle of them) into messages. Throws on malformed data. */
export function decodeOscPacket(buf: Buffer): OscMessage[] {
	if (buf.length === 0) return []
	if (buf[0] === 0x23 /* '#' */) return decodeBundle(buf)
	return [decodeMessage(buf)]
}

function decodeBundle(buf: Buffer): OscMessage[] {
	const [tag, afterTag] = readOscString(buf, 0)
	if (tag !== '#bundle') throw new Error('Not an OSC bundle')
	const messages: OscMessage[] = []
	let offset = afterTag + 8 // skip the 8-byte time tag
	while (offset + 4 <= buf.length) {
		const size = buf.readInt32BE(offset)
		offset += 4
		if (size < 0 || offset + size > buf.length) throw new Error('Bad OSC bundle element size')
		messages.push(...decodeOscPacket(buf.subarray(offset, offset + size)))
		offset += size
	}
	return messages
}

function decodeMessage(buf: Buffer): OscMessage {
	const [address, afterAddress] = readOscString(buf, 0)
	if (!address.startsWith('/')) throw new Error('Not an OSC message')
	const args: OscValue[] = []
	if (afterAddress >= buf.length) return { address, args }

	const [typeTags, afterTags] = readOscString(buf, afterAddress)
	let offset = afterTags
	for (const tag of typeTags.slice(1)) {
		switch (tag) {
			case 'i':
				args.push(buf.readInt32BE(offset))
				offset += 4
				break
			case 'f':
				args.push(buf.readFloatBE(offset))
				offset += 4
				break
			case 'd':
				args.push(buf.readDoubleBE(offset))
				offset += 8
				break
			case 'h':
				args.push(Number(buf.readBigInt64BE(offset)))
				offset += 8
				break
			case 's': {
				const [value, next] = readOscString(buf, offset)
				args.push(value)
				offset = next
				break
			}
			case 'T':
				args.push(true)
				break
			case 'F':
				args.push(false)
				break
			default:
				// Unknown type: we can't know its size, so stop here and keep what we have.
				return { address, args }
		}
	}
	return { address, args }
}
