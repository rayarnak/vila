pragma circom 2.0.0;

// Selects between two inputs based on a selector bit.
// If sel == 0: out[0] = in[0], out[1] = in[1]
// If sel == 1: out[0] = in[1], out[1] = in[0]
template DualMux() {
    signal input in[2];
    signal input sel;
    signal output out[2];

    sel * (1 - sel) === 0;  // sel must be 0 or 1

    out[0] <== (in[1] - in[0]) * sel + in[0];
    out[1] <== (in[0] - in[1]) * sel + in[1];
}
