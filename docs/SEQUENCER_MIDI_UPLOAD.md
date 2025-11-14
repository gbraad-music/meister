# Sequencer MIDI File Upload to Samplecrate

## Executive Summary

This document describes the implementation of direct MIDI file upload from Meister's sequencer to Samplecrate for hardware-based playback. This feature offloads pattern playback from JavaScript to Samplecrate's firmware, providing rock-solid timing, zero browser interference, and superior performance.

---

## Motivation

### Current State: JavaScript-Based Playback

Meister's sequencer currently runs entirely in the browser using JavaScript `setTimeout` loops:
- ✅ **Works well** for basic sequencing with single instance
- ✅ **Synchronized** between multiple sequencers via global clock
- ❌ **Timing jitter** from JavaScript event loop, GC pauses, tab throttling
- ❌ **CPU overhead** from multiple concurrent sequencers
- ❌ **Browser dependent** - stops when tab inactive or browser minimized

### Proposed Solution: Hardware Playback

Upload sequencer patterns to Samplecrate as Standard MIDI Files (SMF) for playback:
- ✅ **Perfect timing** - Firmware-based timing with microsecond precision
- ✅ **Zero interference** - Independent of browser state, UI redraws, or other JavaScript
- ✅ **Lower CPU** - Browser sends pattern once, hardware handles playback loop
- ✅ **Background operation** - Continues playing even when browser tab inactive
- ✅ **Hardware sync** - Direct MIDI clock synchronization without JavaScript latency
- ✅ **Proven infrastructure** - Samplecrate already has MIDI file playback and sequencing

---

## Goals

### Primary Goals

1. **Upload sequencer patterns** as Standard MIDI Files via SysEx
2. **Control playback** remotely (play/stop/loop) from Meister UI
3. **Sync UI state** with hardware playback (position, playing status)
4. **Maintain compatibility** with existing Meister sequencer features

### Secondary Goals

1. **Pattern library** - Store multiple patterns on Samplecrate
2. **Live switching** - Change patterns during playback
3. **Remote editing** - Edit pattern parameters from Meister
4. **Bidirectional sync** - Push to hardware, pull from hardware

---

## Technical Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Meister Web App (Browser)                                  │
│                                                              │
│  ┌────────────────┐                                         │
│  │ Sequencer UI   │                                         │
│  │ (64x4 tracker) │                                         │
│  └───────┬────────┘                                         │
│          │                                                   │
│          │ 1. User clicks "Upload to Device"                │
│          ▼                                                   │
│  ┌──────────────────────────────────┐                       │
│  │ exportMIDI() - Generate SMF      │ (ALREADY EXISTS!)     │
│  └──────────────┬───────────────────┘                       │
│                 │                                            │
│                 │ 2. Chunk MIDI file (256 bytes/chunk)      │
│                 ▼                                            │
│  ┌──────────────────────────────────┐                       │
│  │ SysEx Chunking & Transmission    │ (NEW)                 │
│  └──────────────┬───────────────────┘                       │
│                 │                                            │
└─────────────────┼────────────────────────────────────────────┘
                  │
                  │ 3. Send via Web MIDI API
                  │    F0 7D <dev> 0x20 <chunk#> <data> F7
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Samplecrate (Firmware)                                     │
│                                                              │
│  ┌────────────────────────────────┐                         │
│  │ SysEx Handler (0x20-0x2F)      │ (NEW)                   │
│  └──────────────┬─────────────────┘                         │
│                 │                                            │
│                 │ 4. Reassemble chunks -> MIDI file          │
│                 ▼                                            │
│  ┌──────────────────────────────────┐                       │
│  │ Save to disk:                    │                       │
│  │ /samplecrate/sequences/seq_N.mid │ (USES EXISTING API)   │
│  └──────────────┬───────────────────┘                       │
│                 │                                            │
│                 │ 5. Load into MednessSequence              │
│                 ▼                                            │
│  ┌──────────────────────────────────┐                       │
│  │ MednessSequence Playback Engine  │ (ALREADY EXISTS!)     │
│  └──────────────────────────────────┘                       │
│                                                              │
│  Hardware-based MIDI playback with perfect timing           │
└─────────────────────────────────────────────────────────────┘
```

---

## SysEx Protocol Design

### New Command Range: 0x20-0x2F (Sequence Control)

Extends existing Samplecrate SysEx protocol (manufacturer ID `0x7D`).

### Commands

#### 0x20: SEQUENCE_UPLOAD_START
Initiate a new sequence upload.

**Format:** `F0 7D <dev> 20 <slot> <total_chunks> <file_size_lsb> <file_size_msb> F7`

- `<slot>`: Sequence slot number (0-15)
- `<total_chunks>`: Total number of 256-byte chunks to expect
- `<file_size_lsb>`: File size lower 7 bits
- `<file_size_msb>`: File size upper 7 bits (supports up to 16KB files)

**Example:** Start upload to slot 0, 10 chunks, 2560 bytes
```
F0 7D 02 20 00 0A 00 14 F7
```

**Response:** `F0 7D 02 21 00 00 F7` (ACK ready for chunk 0)

---

#### 0x21: SEQUENCE_UPLOAD_CHUNK
Send a chunk of MIDI file data.

**Format:** `F0 7D <dev> 21 <slot> <chunk#> <data[256]> F7`

- `<slot>`: Sequence slot number (0-15)
- `<chunk#>`: Chunk number (0-based)
- `<data[256]>`: 256 bytes of MIDI file data (7-bit encoded)

**7-bit Encoding:** MIDI SysEx cannot contain bytes > 0x7F, so raw MIDI file bytes must be encoded:
```
Input:  8 bytes [0xAB, 0xCD, 0xEF, ...]
Output: 9 bytes [MSBs, LSB1, LSB2, LSB3, LSB4, LSB5, LSB6, LSB7, LSB8]

MSBs byte = top bits of all 8 bytes packed together
LSB bytes = lower 7 bits of each byte
```

**Example:** Send chunk 0 to slot 0
```
F0 7D 02 21 00 00 [256 bytes of 7-bit encoded data] F7
```

**Response:** `F0 7D 02 21 00 01 F7` (ACK ready for chunk 1)

---

#### 0x22: SEQUENCE_UPLOAD_COMPLETE
Finalize the upload and save to disk.

**Format:** `F0 7D <dev> 22 <slot> F7`

- `<slot>`: Sequence slot number (0-15)

**Example:** Complete upload to slot 0
```
F0 7D 02 22 00 F7
```

**Actions:**
1. Validate reassembled MIDI file (check MThd header)
2. Write to `/samplecrate/sequences/seq_<slot>.mid`
3. Load into `MednessSequence` instance for slot
4. Send ACK

**Response:** `F0 7D 02 22 00 01 F7` (success) or `F0 7D 02 22 00 00 F7` (failure)

---

#### 0x23: SEQUENCE_PLAY
Start playback of a sequence slot.

**Format:** `F0 7D <dev> 23 <slot> F7`

- `<slot>`: Sequence slot number (0-15)

**Example:** Play sequence in slot 0
```
F0 7D 02 23 00 F7
```

---

#### 0x24: SEQUENCE_STOP
Stop playback of a sequence slot.

**Format:** `F0 7D <dev> 24 <slot> F7`

- `<slot>`: Sequence slot number (0-15)

**Example:** Stop sequence in slot 0
```
F0 7D 02 24 00 F7
```

---

#### 0x25: SEQUENCE_SET_LOOP
Set loop mode for a sequence.

**Format:** `F0 7D <dev> 25 <slot> <loop> F7`

- `<slot>`: Sequence slot number (0-15)
- `<loop>`: 0 = play once, 1 = loop infinitely

**Example:** Enable looping for slot 0
```
F0 7D 02 25 00 01 F7
```

---

#### 0x26: SEQUENCE_GET_STATE
Query current playback state of a sequence.

**Format:** `F0 7D <dev> 26 <slot> F7`

**Response:** `F0 7D <dev> 27 <slot> <state> <row> F7`
- `<state>`: 0 = stopped, 1 = playing, 2 = paused
- `<row>`: Current row position (0-63)

---

#### 0x28: SEQUENCE_CLEAR
Delete a sequence from a slot.

**Format:** `F0 7D <dev> 28 <slot> F7`

- `<slot>`: Sequence slot number (0-15)

**Actions:**
1. Stop playback if active
2. Delete `/samplecrate/sequences/seq_<slot>.mid`
3. Clear `MednessSequence` instance

---

#### 0x29: SEQUENCE_LIST
Query which slots have sequences loaded.

**Format:** `F0 7D <dev> 29 F7`

**Response:** `F0 7D <dev> 2A <slots_bitfield_lsb> <slots_bitfield_msb> F7`
- Bitfield where bit N = 1 means slot N has a sequence loaded
- Example: `03 00` = slots 0 and 1 have sequences

---

## Data Encoding: 7-bit for SysEx

MIDI SysEx restricts data bytes to 0x00-0x7F (7 bits). Standard MIDI Files contain 8-bit bytes, so we must encode them.

### Encoding Algorithm

For every 8 bytes of input, produce 9 bytes of output:
```
Byte 0:   MSBs (top bit of each of the 8 input bytes)
Bytes 1-8: Lower 7 bits of each input byte
```

**Example:**
```
Input:  [0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56, 0x78, 0x9A]

MSBs:   bit7 of each byte
        [1, 1, 1, 0, 0, 1, 0, 1] = 0xE5

Output: [0xE5, 0x2B, 0x4D, 0x6F, 0x12, 0x34, 0x56, 0x78, 0x1A]
```

### Decoding Algorithm (Samplecrate firmware)

```c
void decode_7bit_to_8bit(const uint8_t* encoded, uint8_t* decoded, int num_blocks) {
    for (int i = 0; i < num_blocks; i++) {
        uint8_t msbs = encoded[i * 9];
        for (int j = 0; j < 8; j++) {
            decoded[i * 8 + j] = encoded[i * 9 + 1 + j] | ((msbs & (1 << j)) ? 0x80 : 0);
        }
    }
}
```

### Chunk Size Calculation

- Raw MIDI data: 256 bytes
- Encoded for SysEx: 256 ÷ 8 × 9 = 288 bytes
- Total SysEx message: 288 + 7 (header/footer) = **295 bytes per chunk**

---

## Implementation Steps

### Phase 1: Basic Upload (Meister)

1. **Add UI button** to sequencer transport bar: `📤 UPLOAD TO DEVICE`
2. **Reuse `exportMIDI()`** to generate Standard MIDI File
3. **Implement chunking** in new `uploadPatternToDevice()` method
4. **7-bit encoding** for each chunk
5. **Progress dialog** with upload status
6. **Error handling** for failed chunks (retry mechanism)

**Files to modify:**
- `sequencer-scene.js` - Add upload button and UI
- `meister-controller.js` - Add `uploadPatternToDevice()` method

---

### Phase 2: SysEx Protocol (Samplecrate)

1. **Add command handlers** for 0x20-0x2F range in `sysex_callback()`
2. **Implement chunk reassembly** with 7-bit decoding
3. **Validate MIDI file** (check MThd header, track structure)
4. **Write to disk** as `/samplecrate/sequences/seq_<slot>.mid`
5. **Load into MednessSequence** instance
6. **Send ACK responses** for each chunk

**Files to modify:**
- `main.cpp` - Add SysEx handlers in `sysex_callback()`
- New file: `sequence_upload.cpp/h` - Chunked upload state machine

---

### Phase 3: Playback Control (Both Sides)

**Meister:**
1. Add playback control UI to sequencer transport
2. Toggle between "JS Playback" and "HW Playback" modes
3. Send play/stop/loop SysEx commands
4. Poll hardware state (current row position)
5. Sync UI row highlighting with hardware position

**Samplecrate:**
1. Implement play/stop handlers
2. Expose current row position via SysEx query
3. Send playback state change notifications

---

### Phase 4: Pattern Library Management

1. **Pattern slot selector** (0-15) in Meister UI
2. **List sequences** command to show which slots are occupied
3. **Clear/delete** patterns from slots
4. **Pattern metadata** (name, BPM, track count) stored with file

---

## File Format: Standard MIDI File (SMF)

Meister's `exportMIDI()` already generates SMF Format 1:
- ✅ Track 0: Tempo track (BPM, time signature)
- ✅ Tracks 1-4: Note data for each sequencer track
- ✅ Standard PPQN = 480 (ticks per quarter note)
- ✅ Full MIDI timing information

**No changes needed** to the export format! Samplecrate's `MednessSequence` already supports SMF playback.

---

## Storage Architecture

### Samplecrate File Structure

```
/samplecrate/
├── sequences/              (NEW - uploaded sequences)
│   ├── seq_0.mid
│   ├── seq_1.mid
│   ├── ...
│   └── seq_15.mid
├── samples/                (existing)
│   ├── kick.wav
│   └── ...
└── config/                 (existing)
    └── default.rsx
```

### Slot Management

- **16 sequence slots** (0-15)
- Each slot stores one MIDI file on disk
- Each slot has one active `MednessSequence` instance in memory
- Slots persist across Samplecrate restarts

---

## Error Handling

### Upload Errors

| Error | Code | Cause | Recovery |
|-------|------|-------|----------|
| Invalid slot | 0x01 | Slot > 15 | Retry with valid slot |
| Out of order chunk | 0x02 | Missing previous chunks | Restart upload |
| Checksum mismatch | 0x03 | Data corruption | Retry chunk |
| Disk full | 0x04 | No storage space | Delete old sequences |
| Invalid MIDI | 0x05 | Corrupt MIDI file | Re-export from Meister |

**Error Response Format:** `F0 7D <dev> 2F <slot> <error_code> F7`

---

## Performance Considerations

### Bandwidth

- Typical 64-row, 4-track pattern: ~2-4 KB
- Upload time at 31.25 kbps MIDI: ~1-2 seconds
- 16 chunks × 295 bytes = 4720 bytes total transfer

### Memory (Samplecrate)

- **RAM buffer:** 16 KB (largest expected MIDI file)
- **Flash storage:** Unlimited (stored on disk)
- **Active sequences:** 16 × ~4KB = 64 KB max in memory

### CPU (Samplecrate)

- **Upload processing:** Minimal (chunk reassembly is simple)
- **Playback:** Already optimized in `MednessSequence`

---

## Testing Strategy

### Unit Tests

1. **7-bit encoding/decoding** - Verify round-trip
2. **Chunk reassembly** - Test with various file sizes
3. **MIDI validation** - Reject corrupt files
4. **State machine** - Test upload cancellation, retries

### Integration Tests

1. **Upload simple pattern** (4 rows, 1 track)
2. **Upload complex pattern** (64 rows, 4 tracks, all fields filled)
3. **Upload multiple patterns** to different slots
4. **Concurrent playback** of multiple sequences
5. **Pattern switching** during playback

### Stress Tests

1. **Maximum size pattern** (64 rows × 4 tracks fully populated)
2. **Rapid upload/delete** cycles
3. **Network interruption** during upload
4. **Full slot storage** (all 16 slots occupied)

---

## User Workflow Example

### Scenario: Live Performance Setup

1. **Prepare patterns** in Meister sequencer
   - Pattern A: Intro (16 rows)
   - Pattern B: Verse (32 rows, looping)
   - Pattern C: Break (16 rows)
   - Pattern D: Outro (32 rows)

2. **Upload to Samplecrate**
   ```
   Pattern A → Slot 0
   Pattern B → Slot 1
   Pattern C → Slot 2
   Pattern D → Slot 3
   ```

3. **Performance control**
   - Start with Slot 0 (Intro) - plays once, auto-advances
   - Slot 1 (Verse) loops until manual stop
   - Jump to Slot 2 (Break) on pad trigger
   - End with Slot 3 (Outro)

4. **All playback runs on hardware** - zero browser jitter!

---

## Future Enhancements

### Phase 5: Advanced Features

1. **Pattern chaining** - Define playback order across slots
2. **Real-time editing** - Modify notes in uploaded pattern via SysEx
3. **Pattern sync** - Multiple Samplecrate devices playing in sync
4. **MIDI clock master** - Samplecrate becomes clock source for Meister
5. **Bidirectional sync** - Download patterns from Samplecrate to Meister
6. **Pattern morphing** - Crossfade between two patterns
7. **Per-track device routing** - Route each track to different MIDI channels/devices

---

## Compatibility Notes

### Existing Features Preserved

- ✅ JavaScript playback still works (fallback mode)
- ✅ Multiple sequencers in Meister (upload each independently)
- ✅ Global clock sync between sequencers
- ✅ MIDI/SPP sync modes
- ✅ Mixer control faders (work with uploaded patterns)
- ✅ Pad actions for play/stop

### Migration Path

1. **No breaking changes** - Upload is opt-in feature
2. **Toggle switch** - Choose JS or HW playback per sequencer
3. **Hybrid mode** - Some sequencers on JS, others on HW

---

## Documentation Updates Required

1. **Meister:**
   - Update sequencer docs with upload instructions
   - Add "Hardware Playback Mode" section
   - Document slot management UI

2. **Samplecrate:**
   - Update `SAMPLECRATE_SYSEX.md` with 0x20-0x2F commands
   - Add "Sequence Upload" section to README
   - Document `/samplecrate/sequences/` folder

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Upload time | < 3 seconds | 64-row pattern |
| Timing accuracy | < 1ms jitter | Hardware playback |
| CPU reduction | > 50% | Browser CPU usage |
| Pattern capacity | 16 slots | Simultaneous patterns |
| Reliability | 99.9% | Upload success rate |

---

## Conclusion

This feature leverages **existing infrastructure** in both Meister (MIDI export) and Samplecrate (MIDI playback) to provide a robust, high-performance sequencing solution. The implementation is straightforward, well-scoped, and provides immediate value with minimal risk.

**Key advantages:**
- ✅ Uses standard MIDI file format
- ✅ Builds on proven Samplecrate playback engine
- ✅ Maintains backward compatibility
- ✅ Incremental rollout (phase by phase)
- ✅ Clear path to advanced features

**Recommended timeline:**
- **Week 1:** Phase 1 (Meister upload UI)
- **Week 2:** Phase 2 (Samplecrate SysEx handlers)
- **Week 3:** Phase 3 (Playback control integration)
- **Week 4:** Phase 4 (Pattern library management)

**Ready to implement!** 🚀

---

**Document Version:** 1.0
**Author:** Claude (AI Assistant)
**Date:** 2025-11-14
**Status:** Proposal - Awaiting Review
