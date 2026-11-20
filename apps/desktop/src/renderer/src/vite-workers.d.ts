declare module "*?worker" {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}

declare module "*?worker&inline" {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}

declare module "*?worker&url" {
  const url: string;
  export default url;
}
