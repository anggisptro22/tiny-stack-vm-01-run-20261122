import * as fs from 'node:fs';
import * as path from 'node:path';

const IN = process.env.MAKEFUN_INPUT_DIR || '/input';
const OUT = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function runVM(prog: Uint8Array, input: Uint8Array) {
  const D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256);
  let sp = 0, csp = 0, pc = 0, steps = 0, olen = 0, inPos = 0;
  const out = new Uint8Array(65536);
  const trap = (c: number) => ({exit: c, trap: c, stdout: out.slice(0, olen)});
  
  while (steps < 1000000) {
    if (pc < 0 || pc >= prog.length) return trap(9);
    const op = prog[pc];
    
    let imm = 0, pops = 0, pushes = 0;
    switch (op) {
      case 0x00: break;
      case 0x01: imm = 1; pushes = 1; break;
      case 0x02: imm = 4; pushes = 1; break;
      case 0x03: pops = 1; break;
      case 0x04: pops = 1; pushes = 2; break;
      case 0x05: pops = 2; pushes = 2; break;
      case 0x06: pops = 2; pushes = 3; break;
      case 0x07: pops = 3; pushes = 3; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14:
      case 0x15: case 0x16: case 0x18: case 0x19: case 0x1a:
      case 0x1c: case 0x1d: case 0x1e: case 0x20: case 0x21: case 0x22: pops = 2; pushes = 1; break;
      case 0x17: case 0x1b: pops = 1; pushes = 1; break;
      case 0x30: case 0x33: imm = 2; break;
      case 0x31: case 0x32: imm = 2; pops = 1; break;
      case 0x34: break;
      case 0x40: pops = 1; pushes = 1; break;
      case 0x41: pops = 2; break;
      case 0x50: pops = 1; break;
      case 0x51: pops = 1; break;
      case 0x52: pushes = 1; break;
      case 0x53: pops = 1; break;
      default: return trap(5);
    }
    if (pc + imm >= prog.length) return trap(9);
    
    const next = pc + 1 + imm;
    steps++;
    if (sp < pops) return trap(2);
    if (sp - pops + pushes > 256) return trap(3);
    
    pc = next;
    
    switch (op) {
      case 0x00: return {exit: 0, trap: null, stdout: out.slice(0, olen)};
      case 0x01: D[sp++] = (prog[pc-1]<<24)>>24; break;
      case 0x02: D[sp++] = prog[pc-4]|(prog[pc-3]<<8)|(prog[pc-2]<<16)|(prog[pc-1]<<24); break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp-1]; sp++; break;
      case 0x05: { const t = D[sp-1]; D[sp-1] = D[sp-2]; D[sp-2] = t; break; }
      case 0x06: D[sp] = D[sp-2]; sp++; break;
      case 0x07: { const a=D[sp-3]; D[sp-3]=D[sp-2]; D[sp-2]=D[sp-1]; D[sp-1]=a; break; }
      case 0x10: D[sp-2] = (D[sp-2]+D[sp-1])|0; sp--; break;
      case 0x11: D[sp-2] = (D[sp-2]-D[sp-1])|0; sp--; break;
      case 0x12: D[sp-2] = Math.imul(D[sp-2], D[sp-1]); sp--; break;
      case 0x13: if(D[sp-1]===0) return trap(4); D[sp-2] = (D[sp-1]===-1 && D[sp-2]===-2147483648) ? -2147483648 : (D[sp-2]/D[sp-1])|0; sp--; break;
      case 0x14: if(D[sp-1]===0) return trap(4); D[sp-2] = D[sp-1]===-1 ? 0 : (D[sp-2]%D[sp-1])|0; sp--; break;
      case 0x15: if(D[sp-1]===0) return trap(4); D[sp-2] = Math.floor((D[sp-2]>>>0)/(D[sp-1]>>>0))|0; sp--; break;
      case 0x16: if(D[sp-1]===0) return trap(4); D[sp-2] = (D[sp-2]>>>0)%(D[sp-1]>>>0)|0; sp--; break;
      case 0x17: D[sp-1] = -D[sp-1]|0; break;
      case 0x18: D[sp-2] &= D[sp-1]; sp--; break;
      case 0x19: D[sp-2] |= D[sp-1]; sp--; break;
      case 0x1a: D[sp-2] ^= D[sp-1]; sp--; break;
      case 0x1b: D[sp-1] = ~D[sp-1]; break;
      case 0x1c: D[sp-2] <<= (D[sp-1]&31); sp--; break;
      case 0x1d: D[sp-2] >>= (D[sp-1]&31); sp--; break;
      case 0x1e: D[sp-2] = (D[sp-2]>>>(D[sp-1]&31))|0; sp--; break;
      case 0x20: D[sp-2] = D[sp-2]===D[sp-1]?1:0; sp--; break;
      case 0x21: D[sp-2] = D[sp-2]<D[sp-1]?1:0; sp--; break;
      case 0x22: D[sp-2] = (D[sp-2]>>>0)<(D[sp-1]>>>0)?1:0; sp--; break;
      case 0x30: pc = next + (((prog[pc-2]|(prog[pc-1]<<8))<<16)>>16); break;
      case 0x31: if(D[--sp]===0) pc = next + (((prog[pc-2]|(prog[pc-1]<<8))<<16)>>16); break;
      case 0x32: if(D[--sp]!==0) pc = next + (((prog[pc-2]|(prog[pc-1]<<8))<<16)>>16); break;
      case 0x33: if(csp===64) return trap(7); C[csp++] = next; pc = (prog[pc-2]|(prog[pc-1]<<8)); break;
      case 0x34: if(csp===0) return trap(8); pc = C[--csp]; break;
      case 0x40: { const a = D[sp-1]; if(a<0||a>255) return trap(6); D[sp-1] = M[a]; break; }
      case 0x41: { const a = D[sp-1], v = D[sp-2]; if(a<0||a>255) return trap(6); M[a] = v; sp-=2; break; }
      case 0x50: { const s = String(D[--sp]); const b = new TextEncoder().encode(s); if(olen+b.length>65536) return trap(11); out.set(b, olen); olen+=b.length; break; }
      case 0x51: if(olen+1>65536) return trap(11); out[olen++] = D[--sp]&255; break;
      case 0x52: D[sp++] = inPos<input.length?input[inPos++]:-1; break;
      case 0x53: return {exit: D[--sp]&255, trap: null, stdout: out.slice(0, olen)};
    }
  }
  return trap(10);
}

for(const id of fs.readdirSync(IN).sort()) {
  const p = fs.readFileSync(path.join(IN, id, 'program.bin'));
  const i = fs.existsSync(path.join(IN, id, 'input.bin')) ? fs.readFileSync(path.join(IN, id, 'input.bin')) : new Uint8Array(0);
  const res = runVM(p, i);
  fs.mkdirSync(path.join(OUT, id), {recursive: true});
  fs.writeFileSync(path.join(OUT, id, 'stdout.bin'), res.stdout);
  fs.writeFileSync(path.join(OUT, id, 'exit.txt'), res.exit.toString() + '\n');
}
