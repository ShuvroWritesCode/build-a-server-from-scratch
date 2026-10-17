/* Static data: glossary, launch checklist, workload profiles, part catalog, shared build store. */
;(function (S) {
  'use strict';
  var Dt = S.data;

  Dt.glossary = [
    ['Server', 'A computer that provides services (files, websites, apps) to other computers over a network.'],
    ['Rack unit (U)', 'Standard rack height: 1U = 1.75 in (44.45 mm).'],
    ['Form factor', 'The physical size and shape standard of a part or chassis (1U, ATX, E3.S…).'],
    ['Chassis', 'The metal case that holds all the server’s components.'],
    ['Backplane', 'The board behind the drive bays that connects hot-swap drives to the controller.'],
    ['Hot-swap', 'Replacing a part (drive, PSU, fan) while the server keeps running.'],
    ['Motherboard', 'The main circuit board connecting CPU, memory, storage and expansion cards.'],
    ['Socket', 'The CPU’s mount on the motherboard; CPU and socket must match exactly.'],
    ['PCIe lane', 'A high-speed data lane between the CPU and a device. More lanes and newer generations = more bandwidth.'],
    ['Bifurcation', 'Splitting one x16 slot into several smaller links (e.g. 4 × x4) for multiple NVMe drives.'],
    ['Riser', 'A small card that turns slot direction or adds slots inside a slim chassis.'],
    ['Core', 'An independent processing unit inside a CPU — one “worker”.'],
    ['Thread (SMT)', 'Lets one core run two task streams for modest extra throughput (Hyper-Threading).'],
    ['Clock speed (GHz)', 'Cycles per second a core runs; higher means faster per task.'],
    ['Cache', 'Very fast memory on the CPU holding frequently used data.'],
    ['TDP', 'Thermal design power: roughly the heat (watts) a CPU produces under sustained load.'],
    ['NUMA', 'In multi-socket systems each CPU has “near” memory that is faster than the other CPU’s.'],
    ['ECC', 'Error-correcting memory that detects and fixes flipped bits.'],
    ['RDIMM', 'Registered DIMM — the standard server memory stick, buffered for stability at high capacity.'],
    ['UDIMM', 'Unbuffered DIMM, used in entry servers (ECC versions) and desktops.'],
    ['LRDIMM / 3DS', 'Specialised very-high-capacity server memory sticks.'],
    ['MRDIMM', 'Multiplexed-rank DDR5 memory that boosts bandwidth on supported Xeon 6 platforms.'],
    ['Memory channel', 'An independent path between CPU and memory. Fill them all evenly.'],
    ['DPC', 'DIMMs per channel; adding a second stick per channel often lowers speed.'],
    ['HDD', 'Hard disk drive with spinning platters: cheap capacity, slow random access.'],
    ['SSD', 'Solid-state drive using flash memory: fast, no moving parts.'],
    ['NVMe', 'A fast protocol connecting SSDs directly to PCIe lanes.'],
    ['U.2 / U.3 / E3.S', 'Hot-swappable enterprise NVMe drive form factors.'],
    ['IOPS', 'Input/output operations per second — how many small reads/writes a drive can do.'],
    ['Throughput', 'Data moved per second (MB/s or GB/s) — matters for big files.'],
    ['Latency', 'Delay before a request is answered (milliseconds for HDD, microseconds for SSD).'],
    ['TBW / DWPD', 'SSD endurance: total terabytes written / full drive writes per day over the warranty.'],
    ['PLP', 'Power-loss protection: capacitors let an SSD save cached data if power drops.'],
    ['SMR / CMR', 'Two hard-drive recording methods; use CMR for RAID and NAS.'],
    ['RAID', 'Combining drives for speed, redundancy, or both.'],
    ['Parity', 'Calculated (XOR) data that lets RAID 5/6 rebuild a failed drive.'],
    ['HBA / IT mode', 'A controller that passes raw disks to the OS (for ZFS or software RAID).'],
    ['ZFS', 'A filesystem + volume manager with built-in RAID, checksums and snapshots.'],
    ['Rebuild', 'Reconstructing a failed drive’s data onto its replacement.'],
    ['PSU', 'Power supply unit; servers usually have two redundant hot-swap units.'],
    ['80 PLUS', 'Efficiency rating for power supplies (Bronze → Titanium).'],
    ['UPS', 'Uninterruptible power supply: a battery that bridges outages and enables clean shutdown.'],
    ['PDU', 'Power distribution unit — a rack power strip, sometimes metered or switchable.'],
    ['BMC', 'Baseboard management controller: a built-in mini computer for remote management.'],
    ['IPMI / Redfish', 'Standards for talking to the BMC (IPMI is older; Redfish is the modern web API).'],
    ['iDRAC / iLO / XClarity', 'Dell, HPE and Lenovo names for their BMCs.'],
    ['NIC', 'Network interface card — the server’s network connection.'],
    ['SFP+ / SFP28', 'Pluggable network port cages for 10 Gb / 25 Gb modules or cables.'],
    ['DAC', 'Direct-attach copper cable: a cheap, short SFP-to-SFP link.'],
    ['VLAN', 'A virtual network separating traffic on the same physical switch.'],
    ['UEFI / BIOS', 'Firmware that starts the hardware and boots the OS (UEFI is the modern version).'],
    ['POST', 'Power-on self-test: the hardware checks a server runs at startup.'],
    ['Secure Boot / TPM', 'Features that verify boot software and protect encryption keys.'],
    ['Firmware', 'Low-level software built into hardware components.'],
    ['Hypervisor', 'Software that runs virtual machines (Proxmox VE, VMware ESXi, Hyper-V).'],
    ['VM / Container', 'A full virtual computer / a lightweight packaged app sharing the host’s kernel.'],
    ['SSH', 'Secure Shell: an encrypted remote command-line login.'],
    ['Static IP', 'A fixed network address that doesn’t change.'],
    ['Firewall', 'Rules that allow or block network traffic by port and source.'],
    ['3-2-1 backup', '3 copies, 2 kinds of media, 1 offsite.'],
    ['ESD', 'Electrostatic discharge: invisible static shocks that can damage components.'],
    ['QVL', 'Qualified vendor list: parts the manufacturer has tested with a board or server.'],
    ['Burn-in', 'Stress-testing new hardware for hours to catch early failures.']
  ];

  Dt.checklist = [
    'Wrote down the server’s job and expected users',
    'Checked every part against the vendor QVL',
    'Read the DIMM population chart',
    'Bench-tested and ran a 24–48 h burn-in',
    'Racked bottom-up with two people',
    'PSU A and PSU B on separate circuits',
    'BMC on its own network, default password changed',
    'Firmware updated: BMC → BIOS → controllers',
    'RAID or HBA mode configured',
    'OS on mirrored boot drives',
    'Static IP or DHCP reservation set',
    'SSH keys only — password login disabled',
    'Firewall: default deny, only needed ports open',
    'Automatic security updates on',
    'Alerts for disks, temperature and RAID',
    'UPS with automatic shutdown',
    '3-2-1 backups with one offline copy',
    'Practised a full restore',
    'Documented IPs, layout and passwords (in a password manager)'
  ];

  // stress per component 0..1 for each workload (for heat maps / configurator)
  Dt.workloads = {
    nas: { label: 'File server / NAS', stress: { cpu: 0.25, ram: 0.45, drives: 1, nic: 0.8, gpu: 0, psu: 0.35, fans: 0.35 }, note: 'Capacity and network speed', need: { cpu: 6, ram: 32, iops: 2000, tb: 60, net: 10, vram: 0 } },
    web: { label: 'Web server', stress: { cpu: 0.8, ram: 0.55, drives: 0.3, nic: 0.6, gpu: 0, psu: 0.4, fans: 0.45 }, note: 'CPU cores and memory', need: { cpu: 16, ram: 32, iops: 20000, tb: 2, net: 10, vram: 0 } },
    db: { label: 'Database', stress: { cpu: 0.65, ram: 0.9, drives: 0.95, nic: 0.45, gpu: 0, psu: 0.55, fans: 0.55 }, note: 'Fast storage (IOPS) and RAM', need: { cpu: 24, ram: 256, iops: 400000, tb: 8, net: 25, vram: 0 } },
    vm: { label: 'Virtual machines', stress: { cpu: 0.75, ram: 1, drives: 0.6, nic: 0.55, gpu: 0.1, psu: 0.55, fans: 0.55 }, note: 'RAM first, then cores', need: { cpu: 32, ram: 256, iops: 100000, tb: 8, net: 10, vram: 0 } },
    game: { label: 'Game server', stress: { cpu: 0.95, ram: 0.5, drives: 0.25, nic: 0.35, gpu: 0, psu: 0.35, fans: 0.45 }, note: 'Single-core clock speed', need: { cpu: 8, ram: 32, iops: 10000, tb: 1, net: 1, vram: 0 } },
    media: { label: 'Media (Plex/Jellyfin)', stress: { cpu: 0.45, ram: 0.3, drives: 0.85, nic: 0.5, gpu: 0.7, psu: 0.4, fans: 0.4 }, note: 'Capacity + video transcoding', need: { cpu: 8, ram: 16, iops: 2000, tb: 40, net: 2.5, vram: 8 } },
    ai: { label: 'AI inference', stress: { cpu: 0.4, ram: 0.6, drives: 0.35, nic: 0.5, gpu: 1, psu: 1, fans: 1 }, note: 'GPU memory (VRAM)', need: { cpu: 32, ram: 256, iops: 50000, tb: 4, net: 25, vram: 80 } }
  };

  // configurator catalog (approximate late-2026 street prices, USD)
  Dt.parts = {
    cpu: [
      { id: 'e4005', label: 'EPYC 4005 · 8c @5.6 GHz', cores: 8, ghz: 5.6, tdp: 65, lanes: 28, ch: 2, price: 450 },
      { id: 'e4005b', label: 'EPYC 4005 · 16c', cores: 16, ghz: 5.4, tdp: 120, lanes: 28, ch: 2, price: 800 },
      { id: 'x6700', label: 'Xeon 6700P · 32c', cores: 32, ghz: 3.8, tdp: 250, lanes: 88, ch: 8, price: 3200 },
      { id: 'e9005', label: 'EPYC 9005 · 64c', cores: 64, ghz: 3.7, tdp: 300, lanes: 128, ch: 12, price: 6500 },
      { id: 'e9005c', label: 'EPYC 9005 · 128c', cores: 128, ghz: 3.3, tdp: 400, lanes: 128, ch: 12, price: 11000 }
    ],
    ram: [16, 32, 64, 128, 256, 512, 1024],
    storage: [
      { id: 'hdd', label: 'HDD 20 TB', tb: 20, iops: 200, mbs: 270, w: 9, price: 380 },
      { id: 'sata', label: 'SATA SSD 3.84 TB', tb: 3.84, iops: 90000, mbs: 550, w: 4, price: 420 },
      { id: 'nvme4', label: 'NVMe Gen4 7.68 TB', tb: 7.68, iops: 1000000, mbs: 7000, w: 14, price: 900 },
      { id: 'nvme5', label: 'NVMe Gen5 7.68 TB', tb: 7.68, iops: 2500000, mbs: 13000, w: 20, price: 1300 }
    ],
    nic: [1, 2.5, 10, 25, 100],
    gpu: [
      { id: 'none', label: 'No GPU', vram: 0, w: 0, price: 0 },
      { id: 'a380', label: 'Intel Arc A380 · 6 GB', vram: 6, w: 75, price: 140 },
      { id: 'l4', label: 'NVIDIA L4 · 24 GB', vram: 24, w: 72, price: 2500 },
      { id: 'l40s', label: 'NVIDIA L40S · 48 GB', vram: 48, w: 350, price: 8000 },
      { id: 'rtx6000', label: 'RTX PRO 6000 · 96 GB', vram: 96, w: 600, price: 9000 },
      { id: 'h200', label: 'NVIDIA H200 NVL · 141 GB', vram: 141, w: 600, price: 30000 }
    ]
  };

  // shared build: chapters read/write this so the reader's choices carry across the page
  S.build = S.createStore({
    cpuTdp: 280, cpuCores: 32, dimms: 12, dimmGb: 32, drives: 8, driveW: 9, nicW: 20, gpuW: 0, fans: 6, psuW: 1100, rate: 0.15,
    workload: 'vm', raidLevel: 5
  }, {
    persist: 'build',
    derive: function (s) {
      var watts = s.cpuTdp + s.dimms * 10 + s.drives * s.driveW + s.fans * 15 + s.nicW + s.gpuW + 50;
      return { watts: watts, psuNeed: Math.ceil(watts * 1.25 / 50) * 50, kwhYear: watts * 0.6 * 8.76, ramGb: s.dimms * s.dimmGb };
    }
  });
  // chapter completion (build tracker)
  S.progress = S.createStore({ done: {} }, { persist: 'progress' });
  S.markDone = function (ch) {
    var d = S.progress.get().done;
    if (d[ch]) return;
    var nd = Object.assign({}, d); nd[ch] = Date.now();
    S.progress.set({ done: nd });
  };
})(window.SRV);
